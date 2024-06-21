let terrainHeight, waterHeight, sediment, outflowFlux, velocity;
let width, height;
let messagePorts = [];
let quadSize = 10; // Each quad represents 10 square meters
let heightScale = 10000; // 1 unit in the heightmap represents 10000 meters
const epsilon = 1e-6; // Small value to prevent division by zero
let numWorkers = 0;
let workerId = 0;
let stepSize = 0.1;
let updateCount = 0;
let updates = {};
let isSynchronized = false;
let iterationCount = 0;
let totalIterations = 0;


let Kc = 0.1;
let Ks = 0.01;
let Kd = 0.01;

self.onmessage = async function (e) {
    const { 
        buffers, 
        width: w, 
        height: h, 
        numIterations, 
        ports, 
        workerId: id, 
        startY, endY, 
        quadSize: qs, 
        heightScale: hs, 
        numWorkers: nw,
        stepSize: sw,
        Kc: kc,
        Ks: ks,
        Kd: kd
    } = e.data;

    terrainHeight = new Float32Array(buffers.terrainHeight);
    waterHeight = new Float32Array(buffers.waterHeight);
    sediment = new Float32Array(buffers.sediment);
    outflowFlux = new Float32Array(buffers.outflowFlux);
    velocity = new Float32Array(buffers.velocity);
    width = w;
    height = h;
    messagePorts = ports;
    workerId = id;
    numWorkers = nw;
    totalIterations = numIterations;

    if(qs) quadSize = qs;
    if(hs) heightScale = hs;
    if(sw) stepSize = sw;
    if(kc) Kc = kc;
    if(ks) Ks = ks;
    if(kd) Kd = kd;

    messagePorts.forEach(port => {
        port.onmessage = function (msg) {
            const { masterUpdate, bufferUpdates, updateWorkerId } = msg.data;
            if (masterUpdate) {
                applyMasterUpdate(masterUpdate);
                isSynchronized = true;
            } else if (bufferUpdates && workerId === 0) {
                updates[updateWorkerId] = bufferUpdates;
                updateCount++;
                if (updateCount === numWorkers - 1) {
                    synchronizeAndDistribute();
                }
            }
        };
    });

    await iterateSimulation(startY, endY);
};

async function iterateSimulation(startY, endY) {
    for (; iterationCount < totalIterations; iterationCount++) {
        waterIncrement(stepSize);
        simulateFlow(stepSize, startY, endY);
        simulateErosionDeposition(stepSize, startY, endY);
        transportSediment(stepSize, startY, endY);
        evaporation(stepSize, startY, endY);
        handleBoundaryConditions(startY, endY);
        smoothSediment(startY, endY, 3);

        if (workerId === 0) {
            await collectAndDistributeUpdates();
        } else {
            sendUpdatesToMaster(startY, endY);
            await waitForMasterUpdate();
        }

        if (workerId === 0) {
            self.postMessage({ progress: (iterationCount + 1) / totalIterations });
        }
    }

    if (workerId === 0) {
        sendFinalHeightmap();
    }
}

async function collectAndDistributeUpdates() {
    updateCount = 0;
    updates = {};
    await waitForUpdates();
}

function sendUpdatesToMaster(startY, endY) {
    const overlap = 5;
    const extendedStartY = Math.max(0, startY - overlap);
    const extendedEndY = Math.min(height, endY + overlap);

    const bufs = {
        terrainHeight: new Float32Array(terrainHeight),
        waterHeight: new Float32Array(waterHeight),
        sediment: new Float32Array(sediment),
        outflowFlux: new Float32Array(outflowFlux),
        velocity: new Float32Array(velocity)
    };

    const bufferUpdates = {
        startY: extendedStartY,
        endY: extendedEndY,
        ...bufs
    };

    messagePorts[0].postMessage({
        bufferUpdates,
        updateWorkerId: workerId
    }, Object.values(bufs).map((b) => b.buffer));
}

function synchronizeAndDistribute() {
    for (let i = 1; i < numWorkers; i++) {
        const bufferUpdates = updates[i];

        const startY = bufferUpdates.startY;
        const endY = bufferUpdates.endY;

        const bufferTerrainHeight = new Float32Array(bufferUpdates.terrainHeight);
        const bufferWaterHeight = new Float32Array(bufferUpdates.waterHeight);
        const bufferSediment = new Float32Array(bufferUpdates.sediment);
        const bufferOutflowFlux = new Float32Array(bufferUpdates.outflowFlux);
        const bufferVelocity = new Float32Array(bufferUpdates.velocity);

        for (let y = startY; y < endY; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                terrainHeight[index] = (terrainHeight[index] + bufferTerrainHeight[index]) / 2;
                waterHeight[index] = (waterHeight[index] + bufferWaterHeight[index]) / 2;
                sediment[index] = (sediment[index] + bufferSediment[index]) / 2;
                outflowFlux[index * 4] = (outflowFlux[index * 4] + bufferOutflowFlux[index * 4]) / 2;
                outflowFlux[index * 4 + 1] = (outflowFlux[index * 4 + 1] + bufferOutflowFlux[index * 4 + 1]) / 2;
                outflowFlux[index * 4 + 2] = (outflowFlux[index * 4 + 2] + bufferOutflowFlux[index * 4 + 2]) / 2;
                outflowFlux[index * 4 + 3] = (outflowFlux[index * 4 + 3] + bufferOutflowFlux[index * 4 + 3]) / 2;
                velocity[index * 2] = (velocity[index * 2] + bufferVelocity[index * 2]) / 2;
                velocity[index * 2 + 1] = (velocity[index * 2 + 1] + bufferVelocity[index * 2 + 1]) / 2;
            }
        }
    }

    for (let port of messagePorts) {
        const updatedBuffers = {
            terrainHeight: new Float32Array(terrainHeight),
            waterHeight: new Float32Array(waterHeight),
            sediment: new Float32Array(sediment),
            outflowFlux: new Float32Array(outflowFlux),
            velocity: new Float32Array(velocity)
        };

        port.postMessage({ masterUpdate: updatedBuffers }, Object.values(updatedBuffers).map(b => b.buffer));
    }

    isSynchronized = true;
}

function applyMasterUpdate(masterUpdate) {
    terrainHeight = new Float32Array(masterUpdate.terrainHeight);
    waterHeight = new Float32Array(masterUpdate.waterHeight);
    sediment = new Float32Array(masterUpdate.sediment);
    outflowFlux = new Float32Array(masterUpdate.outflowFlux);
    velocity = new Float32Array(masterUpdate.velocity);
}

function waitForSynchronization() {
    return new Promise(resolve => {
        const checkSynchronization = () => {
            if (isSynchronized) {
                isSynchronized = false;
                resolve();
            } else {
                setTimeout(checkSynchronization, 10);
            }
        };
        checkSynchronization();
    });
}

function waitForUpdates() {
    return new Promise(resolve => {
        const checkUpdates = () => {
            if (updateCount === numWorkers - 1) {
                resolve();
            } else {
                setTimeout(checkUpdates, 10);
            }
        };
        checkUpdates();
    });
}

function waitForMasterUpdate() {
    return new Promise(resolve => {
        const checkMasterUpdate = () => {
            if (isSynchronized) {
                isSynchronized = false;
                resolve();
            } else {
                setTimeout(checkMasterUpdate, 10);
            }
        };
        checkMasterUpdate();
    });
}

function sendFinalHeightmap() {
    const finalHeightmap = new Float32Array(terrainHeight);
    self.postMessage({ finalHeightmap }, [finalHeightmap.buffer]);
}

function waterIncrement(dt) {
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const rainfallAmount = 0.01;
            waterHeight[index] += rainfallAmount * dt;
            waterHeight[index] = Math.max(0, Math.min(waterHeight[index], terrainHeight[index]));
        }
    }
}

function simulateFlow(dt, startY, endY) {
    const A = 1;
    const g = 9.81;
    const l = quadSize;
    const overflowThreshold = 1.0; // Set the overflow threshold for water height

    for (let y = startY; y < endY; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;

            const hL = x > 0 ? (waterHeight[index] + terrainHeight[index]) - (waterHeight[index - 1] + terrainHeight[index - 1]) : 0;
            const hR = x < width - 1 ? (waterHeight[index] + terrainHeight[index]) - (waterHeight[index + 1] + terrainHeight[index + 1]) : 0;
            const hT = y > 0 ? (waterHeight[index] + terrainHeight[index]) - (waterHeight[index - width] + terrainHeight[index - width]) : 0;
            const hB = y < height - 1 ? (waterHeight[index] + terrainHeight[index]) - (waterHeight[index + width] + terrainHeight[index + width]) : 0;

            outflowFlux[index * 4] = Math.max(0, outflowFlux[index * 4] + dt * A * g * hL / (l + epsilon));
            outflowFlux[index * 4 + 1] = Math.max(0, outflowFlux[index * 4 + 1] + dt * A * g * hR / (l + epsilon));
            outflowFlux[index * 4 + 2] = Math.max(0, outflowFlux[index * 4 + 2] + dt * A * g * hT / (l + epsilon));
            outflowFlux[index * 4 + 3] = Math.max(0, outflowFlux[index * 4 + 3] + dt * A * g * hB / (l + epsilon));

            const totalFlux = outflowFlux[index * 4] + outflowFlux[index * 4 + 1] + outflowFlux[index * 4 + 2] + outflowFlux[index * 4 + 3];
            const K = Math.min(1, waterHeight[index] * l * l / (totalFlux * dt + epsilon));

            outflowFlux[index * 4] *= K;
            outflowFlux[index * 4 + 1] *= K;
            outflowFlux[index * 4 + 2] *= K;
            outflowFlux[index * 4 + 3] *= K;

            const deltaWaterHeight = dt * (
                (x > 0 ? outflowFlux[(index - 1) * 4 + 1] : 0) - outflowFlux[index * 4] +
                (x < width - 1 ? outflowFlux[(index + 1) * 4] : 0) - outflowFlux[index * 4 + 1] +
                (y > 0 ? outflowFlux[(index - width) * 4 + 3] : 0) - outflowFlux[index * 4 + 2] +
                (y < height - 1 ? outflowFlux[(index + width) * 4 + 2] : 0) - outflowFlux[index * 4 + 3]
            );

            waterHeight[index] += deltaWaterHeight;

            // Check for overflow and redistribute excess water
            if (waterHeight[index] > overflowThreshold) {
                const excessWater = waterHeight[index] - overflowThreshold;
                waterHeight[index] = overflowThreshold;

                const neighbors = [
                    { x: x - 1, y: y }, // left
                    { x: x + 1, y: y }, // right
                    { x: x, y: y - 1 }, // top
                    { x: x, y: y + 1 }  // bottom
                ];

                for (const neighbor of neighbors) {
                    if (neighbor.x >= 0 && neighbor.x < width && neighbor.y >= 0 && neighbor.y < height) {
                        const neighborIndex = neighbor.y * width + neighbor.x;
                        waterHeight[neighborIndex] += excessWater / neighbors.length;
                    }
                }
            }

            waterHeight[index] = Math.max(0, Math.min(waterHeight[index], terrainHeight[index]));

            const avgWaterHeight = (waterHeight[index] + waterHeight[index]) / 2 || epsilon;
            const vx = (outflowFlux[index * 4 + 1] - outflowFlux[index * 4]) / (2 * avgWaterHeight + epsilon);
            const vy = (outflowFlux[index * 4 + 3] - outflowFlux[index * 4 + 2]) / (2 * avgWaterHeight + epsilon);

            velocity[index * 2] = vx;
            velocity[index * 2 + 1] = vy;
        }
    }
}

function simulateErosionDeposition(dt, startY, endY) {
    const Kc = 0.1;
    const Ks = 0.01;
    const Kd = 0.01;

    for (let y = startY; y < endY; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            if (terrainHeight[index] === 0) continue;

            const tiltAngle = Math.atan(Math.hypot(velocity[index * 2], velocity[index * 2 + 1]));
            const velocityMagnitude = Math.hypot(velocity[index * 2], velocity[index * 2 + 1]) || epsilon;

            const sedimentCapacity = Kc * Math.sin(tiltAngle) * velocityMagnitude;

            if (sedimentCapacity > sediment[index]) {
                const erosionAmount = Ks * (sedimentCapacity - sediment[index]);
                terrainHeight[index] = Math.max(0, terrainHeight[index] - erosionAmount / heightScale);
                sediment[index] += erosionAmount;
            } else {
                const depositionAmount = Kd * (sediment[index] - sedimentCapacity);
                sediment[index] -= depositionAmount;
                terrainHeight[index] += depositionAmount / heightScale;
            }
        }
    }
}

function transportSediment(dt, startY, endY) {
    const newSediment = new Float32Array(width * height);
    const sedimentCapacity = 0.1;

    for (let y = startY; y < endY; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            const u = velocity[index * 2];
            const v = velocity[index * 2 + 1];

            const prevX = Math.round(x - u * dt / quadSize);
            const prevY = Math.round(y - v * dt / quadSize);

            if (prevX >= 0 && prevX < width && prevY >= 0 && prevY < height) {
                const prevIndex = prevY * width + prevX;
                newSediment[index] = Math.min(sedimentCapacity, sediment[prevIndex]);
            } else {
                newSediment[index] = Math.min(sedimentCapacity, sediment[index]);
            }
        }
    }
    sediment.set(newSediment.subarray(startY * width, endY * width), startY * width);
}

function evaporation(dt, startY, endY) {
    for (let y = startY; y < endY; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            waterHeight[index] *= (1 - 0.001 * dt);
            waterHeight[index] = Math.max(0, Math.min(waterHeight[index], terrainHeight[index]));
        }
    }
}

function handleBoundaryConditions(startY, endY) {
    for (let x = 0; x < width; x++) {
        sediment[x] = Math.max(0, sediment[x]);
        sediment[(height - 1) * width + x] = Math.max(0, sediment[(height - 1) * width + x]);
    }

    for (let y = startY; y < endY; y++) {
        sediment[y * width] = Math.max(0, sediment[y * width]);
        sediment[y * width + (width - 1)] = Math.max(0, sediment[y * width + (width - 1)]);
    }
}

function smoothSediment(startY, endY, iterations = 3) {
    const smoothedSediment = new Float32Array(sediment);
    for (let iter = 0; iter < iterations; iter++) {
        for (let y = startY + 1; y < endY - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = y * width + x;
                smoothedSediment[index] = (sediment[index] +
                    sediment[index - 1] + sediment[index + 1] +
                    sediment[index - width] + sediment[index + width] +
                    sediment[index - width - 1] + sediment[index - width + 1] +
                    sediment[index + width - 1] + sediment[index + width + 1]) / 9;
            }
        }
        sediment.set(smoothedSediment.subarray(startY * width, endY * width), startY * width);
    }
}


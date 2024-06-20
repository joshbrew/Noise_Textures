import * as BABYLON from 'babylonjs';
import * as colorGrads from './planetGradients';
import { AtmosphericScatteringPostProcess } from './atmosphericScattering';
import './index.css';

import * as noise from './noiseFunctions'


import noiseworker from './noise.worker';
import planetworker from './planet.worker';
import erosionworker from './erosion.worker';


let noiseGen = new noise.BaseNoise();

//just doing this to add an async context, 
document.addEventListener('DOMContentLoaded', async function () {

    
    const segments = 1000; //sphere will have s*s vertices
    const radius = 50;
    
    // Create a table to display SEED, randomizer values, and gradient name
    const infoTable = document.createElement('table');
    infoTable.style.position = 'absolute';
    infoTable.style.top = '10px';
    infoTable.style.right = '10px';
    infoTable.style.zIndex = '2';
    infoTable.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    infoTable.style.border = '1px solid black';
    infoTable.style.padding = '10px';
    infoTable.style.left = '810px';
    infoTable.style.top = '110px';

    // Create the button
    const button = document.createElement('button');
    button.textContent = 'Re-render Mesh';
    button.style.position = 'absolute';
    button.style.left = '810px';
    button.style.zIndex = '2';
    document.body.appendChild(button);

    const canvas3d = document.createElement('canvas');
    canvas3d.width = 800;
    canvas3d.height = 800;
    document.body.appendChild(canvas3d);
    document.body.appendChild(infoTable);

    const engine = new BABYLON.WebGPUEngine(canvas3d, { antialias: true });
            
    let gradientChoices = [
        colorGrads.gradientColorsUtah,
        colorGrads.gradientColorsVolcanic,
        colorGrads.gradientColorsDesert,
        colorGrads.gradientColorsForest,
        colorGrads.gradientColorsOceanic,
        colorGrads.gradientColorsIce,
        colorGrads.gradientColorsIce2
    ];

    let gradientNames = [
        'Utahish',
        'Volcanic',
        'Desert',
        'Forest',
        'Oceanic',
        'Ice',
        'Ice2'
    ];

    let gradIdx = 0;

    let inited = false;
    let SEED, scene, planet, atmosphere, depthRenderer;
    let randomizer1, randomizer2, randomizer3;

    let FBM = true;
    let FBM2 = true;
    let RidgedMultifractal = true;
    let Billow = true

    const createPlanetaryScene = async () => {  

        const interpolateColor = (color1, color2, factor) => {
            return color1.map((c, i) => Math.round(c + factor * (color2[i] - c)));
        };

        const getColor = (value) => {
            const numColors = gradientColors.length;
            const scaledValue = (value + 1) * 0.5 * (numColors - 1);
            let lowerIndex = Math.floor(scaledValue);
            if (lowerIndex < 0) lowerIndex = 0;
            else if (lowerIndex >= numColors) lowerIndex = numColors - 2;
            let upperIndex = Math.min(lowerIndex + 1, numColors - 1);
            if (upperIndex >= numColors) {
                upperIndex = numColors - 1;
                lowerIndex = numColors - 2;
            }

            let factor = scaledValue - lowerIndex;
            factor = Math.max(0.1, Math.min(0.9, factor));

            return interpolateColor(gradientColors[lowerIndex], gradientColors[upperIndex], factor);
        };

        const adjustBrightness = (color, factor) => {
            return color.map(c => Math.round(c * (factor)));
        };

        gradIdx = Math.floor(Math.random() * gradientChoices.length);
        const gradientColors = gradientChoices[gradIdx];
        
        SEED = 12345 + (Math.random() - 0.5);
    
        if (!inited) await engine.initAsync({ antialias: true });
        inited = true;
        scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color3(0, 0, 0); // Black background for the starry sky

        const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 4, radius * 5, new BABYLON.Vector3(0, 0, 0), scene);
        camera.attachControl(canvas3d, true);

        const pointLight = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 50, 0), scene);
        pointLight.intensity = 10;
        pointLight.diffuse = new BABYLON.Color3(1, 1, 1);
        pointLight.specular = new BABYLON.Color3(1, 1, 1);

        const sun = BABYLON.MeshBuilder.CreateSphere("sun", { diameter: 5 }, scene);
        sun.material = new BABYLON.StandardMaterial("sunMaterial", scene);
        sun.material.emissiveColor = new BABYLON.Color3(1, 1, 0.5); // Bright yellow
        sun.material.freeze();

        const shadowGenerator = new BABYLON.ShadowGenerator(4096, pointLight);
        shadowGenerator.usePercentageCloserFiltering = true;

        var godrays = new BABYLON.VolumetricLightScatteringPostProcess(
            'godrays', 1.0, camera, sun, 70, BABYLON.Texture.BILINEAR_SAMPLINGMODE, engine, false);

        godrays.exposure = 0.4;
        godrays.decay = 0.98815;
        godrays.weight = 0.58767;
        godrays.density = 0.9826;

        let offset = noiseGen.seededRandom() * 0.3;
        let offset2 = noiseGen.seededRandom() * 0.1;
        let sign = noiseGen.seededRandom() - 0.5;
        let sign2 = noiseGen.seededRandom() - 0.5;

        randomizer1 = Math.random() * 0.4 - 0.2;
        randomizer2 = Math.random() * 0.2 - 0.1;
        randomizer3 = Math.random() * 0.2 - 0.1;

        if (sign < 0) sign = -1;
        else sign = 1;
        offset *= sign;
        if (sign2 < 0) sign2 = -1;
        else sign2 = 1;
        offset2 *= sign2;

        const generatePlanet = async () => {

            const numWorkers = navigator.hardwareConcurrency || 4;
            const workers = [];
            const segmentSize = Math.ceil(segments / numWorkers);
    
            for (let i = 0; i < numWorkers; i++) {
                workers[i] = new Worker(planetworker);
                workers[i].postMessage({ seed: SEED });
            }
    
            const promises = [];
            const numVertices = (segments + 1) * (segments + 1);
            const totalNoiseValues = numVertices;
            const noiseValues = new Float32Array(totalNoiseValues);
            const coordinates = new Float32Array(totalNoiseValues * 3);

            for (let i = 0; i < numWorkers; i++) {
                const startLat = i * segmentSize;
                let endLat = (i + 1) * segmentSize - 1;

                if (endLat > segments) endLat = segments;

                promises.push(new Promise((resolve) => {
                    workers[i].onmessage = function (e) {
                        const { 
                            noiseValues: workerNoiseValues, 
                            coordinates: workerCoordinates, 
                            startIndex,
                            fbm,fbm2,ridgedMultifractal,billow
                        } = e.data;
                        noiseValues.set(workerNoiseValues, startIndex);
                        coordinates.set(workerCoordinates, startIndex * 3);

                        FBM = fbm;
                        FBM2 = fbm2;
                        RidgedMultifractal = ridgedMultifractal;
                        Billow = billow;

                        resolve();
                    };

                    workers[i].postMessage({
                        latRange: { startLat, endLat },
                        segments,
                        radius,
                        offset,
                        offset2,
                        randomizer1,
                        randomizer2,
                        randomizer3,
                        startIndex: startLat * (segments + 1)
                    });
                }));
            }

            console.log("Generating vertices...");
            console.time("generated vertices");
            await Promise.all(promises);
            workers.forEach((w) => w.terminate());
            console.timeEnd("generated vertices");

            const SPLIT_POSITION_COUNT = 8000000; // Number of positions per split
            const VERTEX_SIZE = 3; // positions
            const NORMAL_SIZE = 3; // normals
            const UV_SIZE = 2; // uvs
            const COLOR_SIZE = 4; // colors
            const INDEX_SIZE = 6; // indices per triangle

            // Calculate the number of vertices per split
            const verticesPerSplit = SPLIT_POSITION_COUNT / VERTEX_SIZE;
            //const numVertices = (segments + 1) * (segments + 1);
            const numSplits = Math.ceil(numVertices / verticesPerSplit);

            // Function to create mesh for each partition
            function createMesh(positions, normals, colors, uvs, indices, index) {
                const planet = new BABYLON.Mesh("custom" + index, scene);

                const vertexData = new BABYLON.VertexData();
                vertexData.positions = positions;
                vertexData.indices = indices;
                vertexData.normals = normals;
                vertexData.colors = colors;
                vertexData.uvs = uvs;
                vertexData.applyToMesh(planet);

                const material = new BABYLON.StandardMaterial("material" + index, scene);
                material.vertexColorEnabled = true;
                material.specularColor = new BABYLON.Color3(0.015, 0.015, 0.015);
                planet.material = material;

                //material.backFaceCulling = false;
                material.freeze();

                planet.receiveShadows = true;
                planet.freezeWorldMatrix();
                shadowGenerator.addShadowCaster(planet);
            }

            // Partition the vertices and indices
            for (let i = 0; i < numSplits; i++) {
                const startLat = i * Math.floor(verticesPerSplit / (segments + 1));
                const endLat = Math.min((i + 1) * Math.floor(verticesPerSplit / (segments + 1)), segments);

                // Preallocate the arrays for this partition
                const numVertsInSegment = (endLat - startLat + 1) * (segments + 1);
                const splitPositions = new Float32Array(numVertsInSegment * VERTEX_SIZE);
                const splitNormals = new Float32Array(numVertsInSegment * NORMAL_SIZE);
                const splitColors = new Float32Array(numVertsInSegment * COLOR_SIZE);
                const splitUvs = new Float32Array(numVertsInSegment * UV_SIZE);
                const splitIndices = new Uint32Array((endLat - startLat) * segments * INDEX_SIZE);

                let vertexOffset = 0;
                let indexOffset = 0;

                for (let lat = startLat; lat <= endLat; lat++) {
                    for (let lon = 0; lon <= segments; lon++) {
                        const noiseIndex = lat * (segments + 1) + lon;
                        const noiseValue = noiseValues[noiseIndex];

                        const index3 = vertexOffset * VERTEX_SIZE;
                        const index4 = vertexOffset * COLOR_SIZE;
                        const index2 = vertexOffset * UV_SIZE;

                        const x = coordinates[noiseIndex * VERTEX_SIZE];
                        const y = coordinates[noiseIndex * VERTEX_SIZE + 1];
                        const z = coordinates[noiseIndex * VERTEX_SIZE + 2];

                        const heightValue = noiseValue * 1.5;
                        const nx = x * radius + x * heightValue;
                        const ny = y * radius + y * heightValue;
                        const nz = z * radius + z * heightValue;

                        splitPositions[index3] = nx;
                        splitPositions[index3 + 1] = nz; //z and y are flipped due to bab's left handed system
                        splitPositions[index3 + 2] = ny;

                        splitNormals[index3] = x;
                        splitNormals[index3 + 1] = z;
                        splitNormals[index3 + 2] = y;

                        const baseColor = !isNaN(noiseValue) ? getColor(noiseValue) : [1, 1, 1];
                        const [r, g, b] = baseColor;
                        splitColors[index4] = r / 255;
                        splitColors[index4 + 1] = g / 255;
                        splitColors[index4 + 2] = b / 255;
                        splitColors[index4 + 3] = 1;

                        splitUvs[index2] = lon / segments;
                        splitUvs[index2 + 1] = lat / segments;

                        vertexOffset++;
                    }
                }

                // Adjust the indices for the current split
                for (let lat = startLat; lat < endLat; lat++) {
                    for (let lon = 0; lon < segments; lon++) {
                        const first = (lat - startLat) * (segments + 1) + lon;
                        const second = first + segments + 1;

                        const index = indexOffset * INDEX_SIZE;

                        splitIndices[index] = first;
                        splitIndices[index + 1] = second;
                        splitIndices[index + 2] = first + 1;
                        splitIndices[index + 3] = second;
                        splitIndices[index + 4] = second + 1;
                        splitIndices[index + 5] = first + 1;

                        indexOffset++;
                    }
                }

                // Create the mesh for this partition
                createMesh(splitPositions, splitNormals, splitColors, splitUvs, splitIndices, i);
            }
                                                

            //if(segments < 2000) {
            depthRenderer = scene.enableDepthRenderer(camera, false, true);

            
            const atmospheresphere = new BABYLON.MeshBuilder.CreateSphere(
                'planetref',{segments:32, radius}, scene
            );

            atmospheresphere.isVisible = false;
            atmospheresphere.freezeWorldMatrix();
            //atmospheresphere.position = planet.position;

            atmosphere = new AtmosphericScatteringPostProcess(
                "atmospherePostProcess",
                atmospheresphere,
                radius,
                radius + 8,
                pointLight,
                camera,
                depthRenderer,
                scene
            );
            //}

           

            return planet;
        };

       
        console.time("generated planet");
        planet = await generatePlanet();
        console.timeEnd("generated planet");

        const tableContent = `
            <tr><th>Parameter</th><th>Value</th></tr>
            <tr><td>Planet Type</td><td> ${gradientNames[gradIdx]}</td></tr>
            <tr><td>Noise Used</td><td> ------ </td></tr>
            <tr><td>FBM</td><td> ${FBM} </td></tr>
            <tr><td>FBM2</td><td> ${FBM2} </td></tr>
            <tr><td>RidgedMF</td><td> ${RidgedMultifractal} </td></tr>
            <tr><td>Billow</td><td> ${Billow} </td></tr>
            <tr><td>Modifiers</td><td> ------ </td></tr>
            <tr><td>SEED</td><td> ${SEED}</td></tr>
            <tr><td>R1</td><td> ${randomizer1}</td></tr>
            <tr><td>R2</td><td> ${randomizer2}</td></tr>
            <tr><td>R3</td><td> ${randomizer3}</td></tr>
            <tr><td>Tectonic R1</td><td> ${offset}</td></tr>
            <tr><td>Tectonic R2</td><td> ${offset2}</td></tr>
        `;
        infoTable.innerHTML = tableContent;


        const pcs = new BABYLON.PointsCloudSystem("pcs", 1, scene);

        const starDistance = radius * 8;
        const minStarDistance = radius * 6;
        const numStars = 20000;

        const gaussianRandom = (mean = 0, stdev = 1) => {
            let u = 1 - Math.random();
            let v = Math.random();
            let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
            return z * stdev + mean;
        };

        const starFunc = (particle) => {
            let theta, phi;

            if (Math.random() < 0.75) {
                theta = Math.random() * 2 * Math.PI * 0.75 + 0.125 + Math.random() - Math.random();

                const verticalOffset = gaussianRandom(0, Math.PI / 24);
                const sharpClustering = gaussianRandom(0, Math.PI / 64);

                phi = Math.PI / 2 + verticalOffset + sharpClustering;
            } else {
                theta = Math.random() * 2 * Math.PI;
                phi = Math.acos(2 * (Math.random() - 0.5));
            }

            const distanceFactor = Math.pow(Math.random(), 0.4);
            const radius = minStarDistance + distanceFactor * (starDistance - minStarDistance);

            particle.position = new BABYLON.Vector3(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi)
            );

            particle.color = new BABYLON.Color4(Math.random(), Math.random(), Math.random(), 1);
            particle.pivot = BABYLON.Vector3.Zero();
        };

        pcs.addPoints(numStars, starFunc);

        pcs.buildMeshAsync().then(() => {
            pcs.mesh.isPickable = false;
            pcs.mesh.alwaysSelectAsActiveMesh = true;

            pcs.mesh.rotation.y += Math.PI / 2;
        });

        const nightLight = new BABYLON.HemisphericLight("nightLight", new BABYLON.Vector3(0, 1, 0), scene);
        nightLight.intensity = 0.2;

        let prevTime = performance.now() * 0.0001;
        scene.registerBeforeRender(() => {
            const time = performance.now() * 0.0001;
            const dt = time - prevTime;
            prevTime = time;

            let rotY = -Math.sin(time);

            pcs.mesh.rotation.y += dt;

            pointLight.position = new BABYLON.Vector3(
                10 * radius * Math.cos(time),
                0,
                10 * radius * rotY
            );

            sun.position = new BABYLON.Vector3(
                3 * radius * Math.cos(time),
                0,
                3 * radius * rotY
            );
        });

        return scene;
    };

    
    const createFlatScene = async () => {

        // Define a set of gradient colors
        const gradientColors = [
            [0, 0, 51],     // Dark blue
            [0, 0, 151],     // Lighter blue
            [0, 0, 151],     // Lighter blue
            [255, 178, 102],// Light orange
            [0, 51, 0],     // Dark green
            [117, 181, 130],     // Light green
            [153, 76, 0],   // Darker orange
            [204, 102, 0],  // Dark orange
            [102, 51, 0],   // Dark brown
            [153, 76, 0],   // Darker orange
            [204, 102, 0],  // Dark orange
            [255, 128, 0],  // Medium dark orange
            [255, 178, 102],// Light orange
            [153, 51, 0],   // Medium dark brown
            [234, 153, 102],// Lighter brown
            [204, 102, 51], // Medium light brown
            [153, 51, 0],   // Medium dark brown
            [102, 51, 0],   // Dark brown
            [51, 25, 0],    // Very dark brown
            [153, 76, 0],   // Darker orange
            [204, 102, 0],  // Dark orange
            [255, 128, 0],  // Medium dark orange
            [255, 178, 102]// Light orange
        ];

        const interpolateColor = (color1, color2, factor) => {
            return color1.map((c, i) => Math.round(c + factor * (color2[i] - c)));
        };

        const getColor = (value) => {
            const numColors = gradientColors.length;
            const scaledValue = (value + 1) * 0.5 * (numColors - 1);
            let lowerIndex = Math.floor(scaledValue);
            if (lowerIndex < 0) lowerIndex = 0;
            else if (lowerIndex >= numColors) lowerIndex = numColors - 2;
            let upperIndex = Math.min(lowerIndex + 1, numColors - 1);
            if (upperIndex >= numColors) {
                upperIndex = numColors - 1;
                lowerIndex = numColors - 2;
            }

            let factor = scaledValue - lowerIndex;
            factor = Math.max(0.1, Math.min(0.9, factor));

            return interpolateColor(gradientColors[lowerIndex], gradientColors[upperIndex], factor);
        };

        // Function to adjust color brightness
        const adjustBrightness = (color, factor) => {
            return color.map(c => Math.round(c * (factor)));
        };


        await engine.initAsync();
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color3(0, 0, 0); // Black background for the starry sky

       
        //const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

        // Create a rotating point light
        const pointLight = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 50, 0), scene);
        pointLight.intensity = 10;
        pointLight.diffuse = new BABYLON.Color3(1, 1, 1);
        pointLight.specular = new BABYLON.Color3(1, 1, 1);

        // Create a sphere to represent the sun
        const sun = BABYLON.MeshBuilder.CreateSphere("sun", { diameter: 20 }, scene);
        sun.material = new BABYLON.StandardMaterial("sunMaterial", scene);
        sun.material.emissiveColor = new BABYLON.Color3(1, 1, 0); // Bright yellow

        // Enable shadows
        const shadowGenerator = new BABYLON.ShadowGenerator(2048, pointLight);
        shadowGenerator.usePercentageCloserFiltering = true

        // Create a ground mesh
        const width = 500;
        const height = 500;
    

        const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 4, width*2, new BABYLON.Vector3(0, 0, 0), scene);
        camera.attachControl(canvas3d, true);

        const maxThreads = navigator.hardwareConcurrency || 4; // Use the maximum number of available threads, default to 4
        
        const promises = [];
        
        const seed = 12345;
        const octaves = 8;
        const lacunarity = 2;
        const gain = 0.5;
        const shift = 1.5;

        const noiseConfigs = [
            { type: 'FractalBrownianMotion', zoom: 1000, octaves: octaves, lacunarity: lacunarity, gain: gain, shift: shift },
            { type: 'FractalBrownianMotion2', zoom: 1000, octaves: octaves, lacunarity: lacunarity, gain: gain, shift: shift },
            { type: 'RidgedMultifractalNoise', zoom: 250, octaves: octaves, lacunarity: lacunarity, gain: gain, shift: shift },
            { type: 'BillowNoise', zoom: 250, octaves: octaves, lacunarity: lacunarity, gain: gain, shift: shift }
        ];

        const heightmap = new Float32Array(width * height);

        // Split height into chunks for each worker
        const chunkSize = Math.ceil(height / maxThreads);
        
        const runNoiseWorkers = async () => {
            const workers = [];
            for (let thread = 0; thread < maxThreads; thread++) {
                const startY = thread * chunkSize;
                const endY = Math.min((thread + 1) * chunkSize - 1, height - 1);
            
                if (startY >= height) break;
            
                const worker = new Worker(noiseworker);
                workers.push(worker);
            
                promises.push(new Promise((resolve) => {
                    worker.onmessage = function (e) {
                        const { noiseValues } = e.data;
                        let index = 0;
                        for (let y = startY; y <= endY; y++) {
                            for (let x = 0; x < width; x++) {
                                const heightValue = noiseValues[index] - 0.2;
                                heightmap[y * width + x] = heightValue; // Slight height shift
                                index++;
                            }
                        }
                        worker.terminate();
                        resolve(true);
                    };
            
                    const xRange = { startX: 0, endX: width - 1 };
                    const yRange = { startY, endY };
            
                    worker.postMessage({ seed, noiseConfigs, xRange, yRange, stepSize: 1 });
                }));
            }
            
            await Promise.all(promises);
        }


        await runNoiseWorkers();


        
        

        function initializeData(heightmap, width, height) {
            const data = {
                terrainHeight: heightmap,
                waterHeight: new Float32Array(width * height),
                sediment: new Float32Array(width * height),
                outflowFlux: new Float32Array(width * height * 4), // 4 directions
                velocity: new Float32Array(width * height * 2), // 2 components
            };
            return data;
        }
        
        function setupWorkers(numWorkers, data, width, height) {
            const workers = [];
            const ports = [];
        
            for (let i = 0; i < numWorkers; i++) {
                for (let j = i + 1; j < numWorkers; j++) {
                    const chan = new MessageChannel();
                    ports.push({ port1: chan.port1, port2: chan.port2, worker1: i, worker2: j });
                }
            }
        
            for (let i = 0; i < numWorkers; i++) {
                const workerPorts = ports.filter(p => p.worker1 === i || p.worker2 === i).map(p => p.worker1 === i ? p.port1 : p.port2);
                const worker = new Worker(erosionworker);
        
                const buffers = {
                    terrainHeight: data.terrainHeight.slice(0),
                    waterHeight: data.waterHeight.slice(0),
                    sediment: data.sediment.slice(0),
                    outflowFlux: data.outflowFlux.slice(0),
                    velocity: data.velocity.slice(0)
                }
        
                worker.postMessage({
                    buffers,
                    width: width,
                    height: height,
                    numIterations: 500, // Example number of iterations
                    ports: workerPorts,
                    numWorkers,
                    stepSize:0.1,
                    quadSize: 10,
                    heightScale: 10000,
                    workerId: i,
                    startY: Math.floor(height / numWorkers) * i,
                    endY: i === numWorkers - 1 ? height : Math.floor(height / numWorkers) * (i + 1)
                }, [...workerPorts, ...Object.values(buffers).map(b => b.buffer)]);
                workers.push(worker);
            }
            return workers;
        }
        
        function handleWorkerMessages(workers) {
            return new Promise((res) => {
                workers.forEach(worker => {
                    worker.onmessage = (e) => {
                        if (e.data.progress !== undefined) {
                            console.log(`Progress: ${Math.round(e.data.progress * 100)}%`);
                        } else if (e.data.finalHeightmap) {
        
                            //console.log('Final heightmap received:', e.data.finalHeightmap);
        
                            workers.forEach((w) => {
                                w.terminate();
                            });
                            
                            res(e.data.finalHeightmap);
                        }
                    };
                });
            });
        }
  
        let minValue = Infinity;
        for (let i = 0; i < heightmap.length; i++) {
            if (heightmap[i] < minValue) {
                minValue = heightmap[i];
            }
        }

        const offset = Math.abs(minValue); // Find the absolute value of the minimum to use as offset
        const adjustedHeightmap = heightmap.map(value => value + offset); // Adjust the heightmap

        const data = initializeData(adjustedHeightmap, width, height);
        const numWorkers = 4;
        const workers = setupWorkers(numWorkers, data, width, height);
        const erosionMap = await handleWorkerMessages(workers, width, height);

        const finalHeightmap = erosionMap.map(value => value - offset); // Revert the offset

        // Preallocate arrays for the custom mesh
        const positions = new Float32Array(width * height * 3);
        const indices = new Uint32Array((width - 1) * (height - 1) * 6);
        const colors = new Float32Array(width * height * 4);
        const uvs = new Float32Array(width * height * 2);
        
        let positionIndex = 0;
        let colorIndex = 0;
        let uvIndex = 0;
        let indexIndex = 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const k = y * width + x;
                const heightValue = finalHeightmap[k];
                
                // Fill positions
                positions[positionIndex++] = x - width / 2;
                positions[positionIndex++] = heightValue * 20;
                positions[positionIndex++] = y - height / 2;
                
                // Fill colors
                const baseColor = getColor(heightValue);
                const [r, g, b] = baseColor;
                colors[colorIndex++] = r / 255;
                colors[colorIndex++] = g / 255;
                colors[colorIndex++] = b / 255;
                colors[colorIndex++] = 1;
                
                // Fill UVs
                uvs[uvIndex++] = x / width;
                uvs[uvIndex++] = y / height;
        
                // Fill indices
                if (x < width - 1 && y < height - 1) {
                    const topLeft = k;
                    const topRight = k + 1;
                    const bottomLeft = k + width;
                    const bottomRight = k + width + 1;
                    indices[indexIndex++] = topLeft;
                    indices[indexIndex++] = topRight;
                    indices[indexIndex++] = bottomLeft;
                    indices[indexIndex++] = topRight;
                    indices[indexIndex++] = bottomRight;
                    indices[indexIndex++] = bottomLeft;
                }
            }
        }

        const customMesh = new BABYLON.Mesh("custom", scene);
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.colors = colors;
        vertexData.uvs = uvs;
        vertexData.applyToMesh(customMesh);

        const material = new BABYLON.StandardMaterial("material", scene);
        material.vertexColorEnabled = true;
        material.specularColor = new BABYLON.Color3(0.015, 0.015, 0.015);
        customMesh.material = material;

        customMesh.receiveShadows = true;
        shadowGenerator.addShadowCaster(customMesh);

        // Create starry sky point cloud system
        const pcs = new BABYLON.PointsCloudSystem("pcs", 1, scene);

        const starDistance = width * 1.5; // Maximum distance from the center of the terrain
        const minStarDistance = width * 0.85; // Minimum distance from the center of the terrain
        const numStars = 20000;

        // Function to generate a Gaussian distribution
        const gaussianRandom = (mean = 0, stdev = 1) => {
            let u = 1 - Math.random(); // Converting [0,1) to (0,1)
            let v = Math.random();
            let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
            return z * stdev + mean;
        };

              
        const starFunc = (particle) => {
            let theta, phi;
            
            // Determine whether the star is part of the Milky Way plane or in the general distribution
            if (Math.random() < 0.75) { // 75% probability for Milky Way stars
                theta = Math.random() * Math.PI * (1.5 + Math.random()*0.5); // Spans 3/4ths around the sphere
                
                // Two levels of clustering
                const verticalOffset = gaussianRandom(0, Math.PI / 16); // Gaussian spread for vertical offset
                const sharpClustering = gaussianRandom(0, Math.PI / 48); // Sharper clustering

                // Combine both clustering effects
                phi = Math.PI / 2 + verticalOffset + sharpClustering;
            } else {
                theta = Math.random() * 2 * Math.PI;
                phi = Math.acos(2 * (Math.random() - 0.5));
            }

            const distanceFactor = Math.pow(Math.random(), 0.4); // Increases density towards the center
            const radius = minStarDistance + distanceFactor * (starDistance - minStarDistance); // Ensures minimum radius

            particle.position = new BABYLON.Vector3(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi)
            );

            particle.color = new BABYLON.Color4(Math.random(), Math.random(), Math.random(), 1);
            particle.pivot = BABYLON.Vector3.Zero();
        };

        pcs.addPoints(numStars, starFunc);

        pcs.buildMeshAsync().then(() => {
            pcs.mesh.isPickable = false;
            pcs.mesh.alwaysSelectAsActiveMesh = true;

            pcs.mesh.rotation.y += Math.PI/2;
        });

        // Create night light
        const nightLight = new BABYLON.HemisphericLight("nightLight", new BABYLON.Vector3(0, 1, 0), scene);
        nightLight.intensity = 0;

        // Animate the point light
        let prevTime = performance.now() * 0.00005
        scene.registerBeforeRender(() => {
            const time = performance.now() * 0.00005;
            const dt = time - prevTime;
            prevTime = time;

            let rotY = Math.sin(time);
            const sunHeight = width * rotY;
            const normalizedHeight = (sunHeight + width) / (2 * width);

            //pcs.mesh.rotation.z += dt;
            pcs.mesh.rotation.x -= dt;

            if(rotY < 0.01 && customMesh.receiveShadows) {
              customMesh.receiveShadows = false;

            } else if (rotY > 0.01 && !customMesh.receiveShadows) {
              customMesh.receiveShadows = true;
            }

            // Update point light position
            pointLight.position = new BABYLON.Vector3(
                width * Math.cos(time),
                sunHeight,
                0
            );
            sun.position = pointLight.position; // Sync sun position with point light

            // Sun color gradient based on height
            if (rotY > 0.5) {
              pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(1, 1, 1), new BABYLON.Color3(1, 0.65, 0.65), (rotY - 0.75) / 0.25);
              pointLight.specular = pointLight.diffuse;
            } else if (rotY > 0.25) {
              pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(1, 0.65, 0.65), new BABYLON.Color3(1, 0.3, 0.3), (rotY - 0.5) / 0.25);
              pointLight.specular = pointLight.diffuse;
            } else if (rotY > 0.15) {
              pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(1, 0.3, 0.3), new BABYLON.Color3(1, 0.08, 0.57), (rotY - 0.25) / 0.25);
              pointLight.specular = pointLight.diffuse;
            } else if (rotY > 0) {
              pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(1, 0.08, 0.57), new BABYLON.Color3(0.1, 0.01, 0.44), rotY / 0.25);
              pointLight.specular = pointLight.diffuse;
            } else {
              pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(0.1, 0.01, 0.44), new BABYLON.Color3(0.1, 0.1, 0.1), rotY / 0.25);
              pointLight.specular = pointLight.diffuse;
            }

            nightLight.intensity = Math.max(0.3, 0.5 - Math.abs(normalizedHeight+0.3));

            // Adjust point light intensity to blend with night light
            pointLight.intensity = Math.min(10,Math.max(0, (2 * Math.abs(normalizedHeight+0.05) - 1)*10));


        });

        return scene;
    };


    scene = await createPlanetaryScene();//createFlatScene();//createFlatScene();//createPlanetaryScene(); //
    scene.freezeActiveMeshes();
    scene.freezeMaterials();
    //scene.freezeWorldMatrix();
    engine.runRenderLoop(() => {
        scene.render();
    });

    window.addEventListener('resize', () => {
        engine.resize();
    });

   button.addEventListener('click', async () => {
       button.disabled = true;
       scene.dispose();
       await createPlanetaryScene();
       button.disabled = false;
   });


});
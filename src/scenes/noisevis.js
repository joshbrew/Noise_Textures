import * as noise from '../noiseFunctions';
import noiseworker from '../noise.worker';

// List of noise generators to visualize
const noiseGenerators = [
    'PerlinNoise',
    'BillowNoise',
    'AntiBillowNoise',
    'LanczosBillowNoise',
    'LanczosAntiBillowNoise',
    'RidgeNoise',
    'RidgedMultifractalNoise',
    'FractalBrownianMotion',
    'FractalBrownianMotion2',
    'FractalBrownianMotion3',
    'PerlinWorms',
    'HexWorms'
];

// Function to create a canvas and append it to the container
const createCanvas = (size, title) => {
    const container = document.body;
    const canvas = document.createElement('canvas');
    canvas.style.position = 'relative';
    canvas.width = size;
    canvas.height = size;
    container.appendChild(canvas);

    const context = canvas.getContext('2d');
    context.fillStyle = 'black';
    context.fillRect(0, 0, size, size);

    const titleElement = document.createElement('p');
    titleElement.textContent = title;
    container.appendChild(titleElement);

    return canvas;
};

// Function to run the noise worker for a given noise generator
const runNoiseWorker = async (seed, noiseType, canvas) => {
    const size = canvas.width;
    const context = canvas.getContext('2d');
    const imageData = context.createImageData(size, size);
    const data = imageData.data;

    const map = new Float32Array(size * size);
    const maxThreads = navigator.hardwareConcurrency || 4;
    const chunkSize = Math.ceil(size / maxThreads);
    const workers = [];
    const promises = [];

    for (let thread = 0; thread < maxThreads; thread++) {
        const startY = thread * chunkSize;
        const endY = Math.min((thread + 1) * chunkSize, size);

        if (startY >= size) break;

        const worker = new Worker(noiseworker);
        workers.push(worker);

        promises.push(new Promise((resolve) => {
            worker.onmessage = function (e) {
                const { noiseValues } = e.data;

                let index = 0;
                for (let y = startY; y < endY; y++) {
                    for (let x = 0; x < size; x++) {
                        const noiseValue = noiseValues[index++];
                        map[y * size + x] = noiseValue; // Store the noise value

                        const brightnessFactor = (noiseValue + 1) * 0.5;
                        const intensity = Math.floor(brightnessFactor * 255);
                        const pixelIndex = (y * size + x) * 4;
                        data[pixelIndex] = intensity;
                        data[pixelIndex + 1] = intensity;
                        data[pixelIndex + 2] = intensity;
                        data[pixelIndex + 3] = 255;
                    }
                }

                worker.terminate(); // Cleanup
                resolve(true);
            };

            const xRange = { start: 0, end: size - 1 };
            const yRange = { start: startY, end: endY - 1 };

            const noiseConfigs = [{
                type: noiseType,
                zoom: 50.0,
                octaves: 8,
                lacunarity: 2.0,
                gain: 0.5,
                shift: 100,
                frequency: 1
            }];

            worker.postMessage({ seed, noiseConfigs, xRange, yRange, stepSize: 1 });
        }));
    }

    await Promise.all(promises);

    context.putImageData(imageData, 0, 0);
};

// Main function to run all noise generators
const visualizeNoiseGenerators = async () => {

    const seed = Math.random() * 100000; //share seed

    for (const noiseType of noiseGenerators) {
        const canvas = createCanvas(500, noiseType);
        await runNoiseWorker(seed, noiseType, canvas);
    }
};

// Run the visualization
visualizeNoiseGenerators();

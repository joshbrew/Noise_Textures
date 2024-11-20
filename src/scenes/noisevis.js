import * as noise from '../noiseFunctions';
import noiseworker from '../noise.worker';
import { noiseGeneratorNames } from '../common';



// Global variable to control abortion of noise generation
let abortFlag = false;
let currentWorker = null;

// Function to create a canvas and append it to the container
const createCanvas = (width, height, title) => {
    // Create a flex container if it doesn't exist
    let container = document.querySelector('.canvas-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'canvas-container';
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.gap = '10px'; // Optional: gap between canvases
        document.body.appendChild(container);
    }

    // Create a wrapper for canvas and title
    const canvasWrapper = document.createElement('div');
    canvasWrapper.style.position = 'relative';
    canvasWrapper.style.width = `${width}px`;
    canvasWrapper.style.height = `${height}px`;
    canvasWrapper.style.flexShrink = '0'; // Prevent the wrapper from shrinking

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.display = 'block'; // To ensure the canvas takes the full width of its container

    const context = canvas.getContext('2d');
    context.fillStyle = 'black';
    context.fillRect(0, 0, width, height);

    const titleElement = document.createElement('div');
    titleElement.innerText = title;
    titleElement.style.position = 'absolute';
    titleElement.style.top = '0';
    titleElement.style.left = '0';
    titleElement.style.width = '100%';
    titleElement.style.zIndex = '2';
    titleElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    titleElement.style.color = 'white';
    titleElement.style.margin = '0';
    titleElement.style.padding = '5px';
    titleElement.style.boxSizing = 'border-box';

    canvasWrapper.appendChild(canvas);
    canvasWrapper.appendChild(titleElement);
    container.appendChild(canvasWrapper);

    return canvas;
};

// Function to run the noise worker for a given noise generator
const runNoiseWorker = async (seed, canvas, noiseConfigs, stepSize) => {
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext('2d');
    const imageData = context.createImageData(width, height);
    const data = imageData.data;

    const map = new Float32Array(width * height);
    const maxThreads = navigator.hardwareConcurrency || 4;
    const chunkSize = Math.ceil(height / maxThreads);
    const workers = [];
    const promises = [];

    for (let thread = 0; thread < maxThreads; thread++) {
        if (abortFlag) {
            if (currentWorker) currentWorker.terminate();
            return;
        }

        const startY = thread * chunkSize;
        const endY = Math.min((thread + 1) * chunkSize, height);

        if (startY >= height) break;

        const worker = new Worker(noiseworker);
        currentWorker = worker;
        workers.push(worker);

        promises.push(new Promise((resolve) => {
            worker.onmessage = function (e) {
                const { noiseValues } = e.data;

                let index = 0;
                for (let y = startY; y < endY; y++) {
                    for (let x = 0; x < width; x++) {
                        const noiseValue = noiseValues[index++];
                        map[y * width + x] = noiseValue; // Store the noise value

                        const brightnessFactor = (noiseValue + 1) * 0.5;
                        const intensity = Math.floor(brightnessFactor * 255);
                        const pixelIndex = (y * width + x) * 4;
                        data[pixelIndex] = intensity;
                        data[pixelIndex + 1] = intensity;
                        data[pixelIndex + 2] = intensity;
                        data[pixelIndex + 3] = 255;
                    }
                }

                worker.terminate(); // Cleanup
                resolve(true);
            };

            worker.postMessage({ seed, noiseConfigs, xRange: { start: 0, end: width - 1 }, yRange: { start: startY, end: endY - 1 }, stepSize });
        }));
    }

    await Promise.all(promises);

    try { context.putImageData(imageData, 0, 0); } catch (er) { console.error(er); }
};

// Function to regenerate all canvases with updated parameters
const generateCanvases = async () => {
    let container = document.querySelector('.canvas-container');
    if (!container) {
        container = document.createElement('span');
        container.className = 'canvas-container';
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.gap = '10px'; // Optional: gap between canvases
        document.body.appendChild(container);
    }
    // Get the updated parameters from the controls
    const seed = parseFloat(document.querySelector('#seed').value);
    const zoom = parseFloat(document.querySelector('#zoom').value);
    const octaves = parseInt(document.querySelector('#octaves').value, 10);
    const lacunarity = parseFloat(document.querySelector('#lacunarity').value);
    const gain = parseFloat(document.querySelector('#gain').value);
    const xShift = parseFloat(document.querySelector('#xShift').value);
    const yShift = parseFloat(document.querySelector('#yShift').value);
    // const zShift = parseFloat(document.querySelector('#zShift').value);
    const frequency = parseFloat(document.querySelector('#frequency').value);
    const width = parseInt(document.querySelector('#width').value, 10);
    const height = parseInt(document.querySelector('#height').value, 10);

    // Remove existing canvases
    container.innerHTML = '';

    for (const noiseType of noiseGeneratorNames) {
        if (abortFlag) break;

        const noiseConfigs = [{
            type: noiseType,
            zoom,
            octaves,
            lacunarity,
            gain,
            xShift,
            yShift,
            // zShift,
            frequency
        }];
        const canvas = createCanvas(width, height, noiseType);
        await runNoiseWorker(seed, canvas, noiseConfigs, 1);
    }

    return container;
};

// Function to create control inputs
const createControls = () => {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'controls-container';
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.right = '10px';
    controlsContainer.style.marginBottom = '20px';
    controlsContainer.style.zIndex = '10';
    document.body.appendChild(controlsContainer);

    controlsContainer.insertAdjacentHTML('afterbegin', `
        <div style="font-size:10px;">Seed and settings will dramatically</br> alter noise quality.</div>
    `);

    const controls = [
        { id: 'seed', label: 'Seed', type: 'number', value: 12345.678910 },
        { id: 'zoom', label: 'Zoom', type: 'number', value: 50.0 },
        { id: 'octaves', label: 'Octaves', type: 'number', value: 8 },
        { id: 'lacunarity', label: 'Lacunarity', type: 'number', value: 2.0 },
        { id: 'gain', label: 'Gain', type: 'number', value: 0.5 },
        { id: 'xShift', label: 'X Shift', type: 'number', value: 100 },
        { id: 'yShift', label: 'Y Shift', type: 'number', value: 100 },
        // { id: 'zShift', label: 'Z Shift', type: 'number', value: 100 },
        { id: 'frequency', label: 'Frequency', type: 'number', value: 1 },
        { id: 'width', label: 'Width', type: 'number', value: 500 },
        { id: 'height', label: 'Height', type: 'number', value: 500 }
    ];

    controls.forEach(control => {
        const controlWrapper = document.createElement('div');
        controlWrapper.style.marginBottom = '10px';

        const label = document.createElement('label');
        label.htmlFor = control.id;
        label.innerText = `${control.label}: `;
        controlWrapper.appendChild(label);

        const input = document.createElement('input');
        input.id = control.id;
        input.type = control.type;
        input.value = control.value;
        controlWrapper.appendChild(input);

        controlsContainer.appendChild(controlWrapper);
    });

    const regenerateButton = document.createElement('button');
    regenerateButton.innerText = 'Regenerate Canvases';
    regenerateButton.onclick = async () => {
        regenerateButton.disabled = true;
        abortFlag = false;
        await generateCanvases();
        regenerateButton.disabled = false;
    };

    const abortButton = document.createElement('button');
    abortButton.innerText = 'Abort Generation';
    abortButton.onclick = () => {
        abortFlag = true;
        if (currentWorker) {
            currentWorker.terminate();
            currentWorker = null;
        }
        regenerateButton.disabled = false;
    };

    controlsContainer.appendChild(regenerateButton);
    controlsContainer.appendChild(abortButton);

    return { container: controlsContainer, regenerateButton, abortButton };
};

// Create controls and run the initial visualization
export async function renderNoiseTextures() {
    const controls = createControls();
    controls.regenerateButton.disabled = true;
    const canvasContainer = await generateCanvases();
    controls.regenerateButton.disabled = false;

    return {
        controls,
        canvasContainer
    };
}

export async function clearNoiseTextureRender(render) {
    render.controls.container.remove();
    render.canvasContainer.remove();

    return true;
}

import * as noise from '../noiseFunctions';
import noiseworker from '../noise.worker';

// Categorized noise generators
const noiseCategories = {
    "Basic": [
        'PerlinNoise',
        'BillowNoise',
        'AntiBillowNoise',
        'Hermite',
        'Quintic',
        'Cosine',
    ],
    "Fractal Brownian Motion": [
        'FractalBrownianMotion',
        'FractalBrownianMotion2',
        'FractalBrownianMotion3'
    ],
    "Ridge": [
        'RidgeNoise',
        'AntiRidgeNoise',
        'RidgedMultifractalNoise',
        'RidgedMultifractalNoise2',
        'RidgedMultifractalNoise3',
        'RidgedMultifractalNoise4',
        'RidgedAntiMultifractalNoise',
        'RidgedAntiMultifractalNoise2',
        'RidgedAntiMultifractalNoise3',
        'RidgedAntiMultifractalNoise4'
    ],
    "Cellular": [
        'Cellular',
        'Worley',
        'CellularBrownianMotion',
        'CellularBrownianMotion2',
        'CellularBrownianMotion3'
    ],
    "Voronoi": [
        'VoronoiTileNoise',
        'VoronoiFlatShadeTileNoise',
        'VoronoiBrownianMotion',
        'VoronoiBrownianMotion2',
        'VoronoiBrownianMotion3',
        'VoronoiCircleGradientTileNoise',
        'VoronoiCircleGradientTileNoise2',
        'VoronoiRipple3D',
        'VoronoiRipple3D2',
        'VoronoiCircularRipple3D',
        'FVoronoiRipple3D',
        'FVoronoiCircularRipple3D'
    ],
    "Worms": [
        'PerlinWorms',
        'HexWorms'
    ],
    "Ripples": [
        'RippleNoise',
        'FractalRipples'
    ]
};

// Global variables
let abortFlag = false;
let currentWorkers = []; // Store multiple workers
let overrides = {}; // Store individual noise generator overrides

// Function to create a responsive canvas
const createCanvas = (width, height) => {
    let container = document.querySelector('.canvas-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'canvas-container';
        document.querySelector('.main-container').appendChild(container);
    }

    let canvas = document.querySelector('canvas.noisecanvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.classList.add('noisecanvas');
        container.appendChild(canvas);
    }

    // Set initial size
    canvas.width = width;
    canvas.height = height;

    // Make canvas responsive
   
    return canvas;
};

// Function to run the noise worker for selected noise generators
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
        const startY = thread * chunkSize;
        const endY = Math.min((thread + 1) * chunkSize, height);

        if (startY >= height) break;

        const worker = new Worker(noiseworker);
        currentWorkers.push(worker);

        promises.push(new Promise((resolve) => {
            worker.onmessage = function (e) {
                if (abortFlag) {
                    worker.terminate();
                    resolve(false);
                    return;
                }

                const { noiseValues } = e.data;

                let index = 0;
                for (let y = startY; y < endY; y++) {
                    for (let x = 0; x < width; x++) {
                        const noiseValue = noiseValues[index++];
                        map[y * width + x] = noiseValue;

                        const brightnessFactor = (noiseValue + 1) * 0.5;
                        const intensity = Math.floor(brightnessFactor * 255);
                        const pixelIndex = (y * width + x) * 4;
                        data[pixelIndex] = intensity;
                        data[pixelIndex + 1] = intensity;
                        data[pixelIndex + 2] = intensity;
                        data[pixelIndex + 3] = 255;
                    }
                }

                worker.terminate();
                resolve(true);
            };

            worker.postMessage({
                seed,
                noiseConfigs,
                xRange: { start: 0, end: width - 1 },
                yRange: { start: startY, end: endY - 1 },
                stepSize
            });
        }));
    }

    const results = await Promise.all(promises);
    currentWorkers = [];

    if (!abortFlag) {
        context.putImageData(imageData, 0, 0);
    }
};

// Function to regenerate canvas with the selected noise configurations
const generateCanvas = async () => {
    if (abortFlag) return;

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
    const scalar = parseFloat(document.querySelector('#scalar').value) || 1;
    const transform = parseFloat(document.querySelector('#transform').value) || 0;

    const selectedNoises = Array.from(document.querySelectorAll('.noise-checkbox:checked')).map(cb => cb.value);

    const noiseConfigs = selectedNoises.map(noiseType => {
        const override = overrides[noiseType] || {};
        return {
            type: noiseType,
            zoom: override.zoom !== undefined ? override.zoom : zoom,
            octaves: override.octaves !== undefined ? override.octaves : octaves,
            lacunarity: override.lacunarity !== undefined ? override.lacunarity : lacunarity,
            gain: override.gain !== undefined ? override.gain : gain,
            xShift: override.xShift !== undefined ? override.xShift : xShift,
            yShift: override.yShift !== undefined ? override.yShift : yShift,
            // zShift: override.zShift !== undefined ? override.zShift : zShift,
            frequency: override.frequency !== undefined ? override.frequency : frequency,
            scalar: override.scalar !== undefined ? override.scalar : scalar, // Scalar multiplier
            transform: override.transform !== undefined ? override.transform : transform
        };
    });

    const canvas = createCanvas(width, height);
    await runNoiseWorker(seed, canvas, noiseConfigs, 1);
};

// Function to create control inputs and render noise options with categories
const createControls = () => {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'controls-container';
    document.querySelector('.main-container').appendChild(controlsContainer);

    const controls = [
        { id: 'width', label: 'Width', type: 'number', value: 500 },
        { id: 'height', label: 'Height', type: 'number', value: 500 },
        { id: 'seed', label: 'Seed', type: 'number', value: 12345.678910 },
        { id: 'zoom', label: 'Zoom', type: 'number', value: 50.0 },
        { id: 'lacunarity', label: 'Lacunarity', type: 'number', value: 2.0 },
        { id: 'octaves', label: 'Octaves', type: 'number', value: 8 },
        { id: 'frequency', label: 'Frequency', type: 'number', value: 1 },
        { id: 'gain', label: 'Gain', type: 'number', value: 0.5 },
        { id: 'scalar', label: 'Scalar (multiply)', type: 'number', value: 1 },
        { id: 'transform', label: 'Transform (add)', type: 'number', value: 0 },
        { id: 'xShift', label: 'X Shift', type: 'number', value: 100 },
        { id: 'yShift', label: 'Y Shift', type: 'number', value: 100 }//,
        // { id: 'zShift', label: 'Z Shift', type: 'number', value: 100 }
    ];

    // Create input controls
    controls.forEach(control => {
        const controlWrapper = document.createElement('div');
        controlWrapper.className = 'control-wrapper';

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

    // Create noise generator options with categories
    const noiseOptionsContainer = document.createElement('div');
    noiseOptionsContainer.className = 'noise-options-container';
    controlsContainer.appendChild(noiseOptionsContainer);

    let selected = false;

    for (const [category, noises] of Object.entries(noiseCategories)) {
        const categoryWrapper = document.createElement('div');
        categoryWrapper.className = 'category-wrapper';

        // Category Header
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'category-header';
        categoryHeader.innerText = category;
        categoryHeader.onclick = () => {
            categoryContent.classList.toggle('collapsed');
            categoryHeader.classList.toggle('active');
        };
        categoryWrapper.appendChild(categoryHeader);

        // Category Content
        const categoryContent = document.createElement('div');
        categoryContent.className = 'category-content';

        noises.forEach(noise => {
            const noiseWrapper = document.createElement('div');
            noiseWrapper.className = 'noise-wrapper';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = noise;
            checkbox.className = 'noise-checkbox';
            checkbox.id = `checkbox-${noise}`;

            if(!selected) { //set first to true
                checkbox.checked = true;
                selected = true;
            }

            const label = document.createElement('label');
            label.htmlFor = `checkbox-${noise}`;
            label.innerText = noise;

            const overrideButton = document.createElement('button');
            overrideButton.innerText = '';
            overrideButton.className = 'override-button';
            overrideButton.onclick = (e) => {
                e.stopPropagation(); // Prevent triggering category toggle
                openOverrideModal(noise);
            };

            noiseWrapper.appendChild(checkbox);
            noiseWrapper.appendChild(label);
            noiseWrapper.appendChild(overrideButton);
            categoryContent.appendChild(noiseWrapper);
        });

        categoryWrapper.appendChild(categoryContent);
        noiseOptionsContainer.appendChild(categoryWrapper);
    }

    // Create action buttons
    const actionButtonsWrapper = document.createElement('div');
    actionButtonsWrapper.className = 'action-buttons-wrapper';

    const regenerateButton = document.createElement('button');
    regenerateButton.innerText = 'Generate Noise';
    regenerateButton.onclick = async () => {
        abortFlag = false;
        regenerateButton.disabled = true;
        await generateCanvas();
        regenerateButton.disabled = false;
    };

    const abortButton = document.createElement('button');
    abortButton.innerText = 'Abort Generation';
    abortButton.onclick = () => {
        abortFlag = true;
        currentWorkers.forEach(worker => worker.terminate());
        currentWorkers = [];
        regenerateButton.disabled = false;
    };

    actionButtonsWrapper.appendChild(regenerateButton);
    actionButtonsWrapper.appendChild(abortButton);
    controlsContainer.appendChild(actionButtonsWrapper);
};

let modalCounter = 0;

// Function to open modal for customizing noise settings
const openOverrideModal = (noiseType) => {
    const modal = document.createElement('div');
    modal.className = 'modal';

    // Increment the counter to ensure unique IDs for each modal
    modalCounter += 1;
    const uniqueId = `modal-${noiseType}-${modalCounter}`;

    const modalContent = `
        <div class="modal-content">
            <h3>Customize ${noiseType} Parameters</h3>
            <label>Scalar: <input id="${uniqueId}-scalar" type="number" step="0.1" value="${overrides[noiseType]?.scalar || 1}"></label><br>
            <label>Transform (add): <input id="${uniqueId}-transform" type="number" step="0.1" value="${overrides[noiseType]?.transform || 0}"></label><br>
            <label>Zoom: <input id="${uniqueId}-zoom" type="number" step="0.1" value="${overrides[noiseType]?.zoom || ''}"></label><br>
            <label>Octaves: <input id="${uniqueId}-octaves" type="number" step="1" value="${overrides[noiseType]?.octaves || ''}"></label><br>
            <label>Lacunarity: <input id="${uniqueId}-lacunarity" type="number" step="0.1" value="${overrides[noiseType]?.lacunarity || ''}"></label><br>
            <label>Gain: <input id="${uniqueId}-gain" type="number" step="0.1" value="${overrides[noiseType]?.gain || ''}"></label><br>
            <label>X Shift: <input id="${uniqueId}-xShift" type="number" step="1" value="${overrides[noiseType]?.xShift || ''}"></label><br>
            <label>Y Shift: <input id="${uniqueId}-yShift" type="number" step="1" value="${overrides[noiseType]?.yShift || ''}"></label><br>
            <label>Frequency: <input id="${uniqueId}-frequency" type="number" step="0.1" value="${overrides[noiseType]?.frequency || ''}"></label><br>
            <div class="modal-buttons">
                <button id="${uniqueId}-save-override">Save</button>
                <button id="${uniqueId}-reset-override">Reset</button>
                <button id="${uniqueId}-close-modal">Close</button>
            </div>
        </div>
    `;
    modal.innerHTML = modalContent;
    document.body.appendChild(modal);

    // Set up event handlers with unique IDs
    document.getElementById(`${uniqueId}-save-override`).onclick = () => {
        overrides[noiseType] = {
            zoom: parseFloat(document.getElementById(`${uniqueId}-zoom`).value) || overrides[noiseType]?.zoom,
            octaves: parseInt(document.getElementById(`${uniqueId}-octaves`).value, 10) || overrides[noiseType]?.octaves,
            lacunarity: parseFloat(document.getElementById(`${uniqueId}-lacunarity`).value) || overrides[noiseType]?.lacunarity,
            gain: parseFloat(document.getElementById(`${uniqueId}-gain`).value) || overrides[noiseType]?.gain,
            xShift: parseFloat(document.getElementById(`${uniqueId}-xShift`).value) || overrides[noiseType]?.xShift,
            yShift: parseFloat(document.getElementById(`${uniqueId}-yShift`).value) || overrides[noiseType]?.yShift,
            // zShift: parseFloat(document.getElementById(`${uniqueId}-zShift`).value) || overrides[noiseType]?.zShift,
            frequency: parseFloat(document.getElementById(`${uniqueId}-frequency`).value) || overrides[noiseType]?.frequency,
            scalar: parseFloat(document.getElementById(`${uniqueId}-scalar`).value) || 1,
            transform: parseFloat(document.getElementById(`${uniqueId}-transform`).value) || 0
        };
        modal.remove();
    };

    document.getElementById(`${uniqueId}-reset-override`).onclick = () => {
        delete overrides[noiseType];
        modal.remove();
    };

    document.getElementById(`${uniqueId}-close-modal`).onclick = () => {
        modal.remove();
    };
};


// Initialize the noise rendering controls
export async function renderNoiseTextures() {
    
    let mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        mainContainer = document.createElement('div');
        mainContainer.className = 'main-container';
        document.body.appendChild(mainContainer);
    }

    createControls();

    // Create initial canvas
    createCanvas(500, 500);
    await generateCanvas();

    return {
        mainContainer
    }

}

export async function clearNoiseTextureRender(render) {
    if(render?.mainContainer) render.mainContainer.remove();
}

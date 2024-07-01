import * as noise from '../noiseFunctions';
import noiseworker from '../noise.worker';

// List of noise generators to visualize
const noiseGenerators = [
    //Traditional noise types
    'PerlinNoise',
    'BillowNoise',
    'AntiBillowNoise',
    'LanczosBillowNoise',
    'LanczosAntiBillowNoise',
    'RidgeNoise',
    'AntiRidgeNoise',

    'RidgedMultifractalNoise',
    'RidgedMultifractalNoise2',
    'RidgedMultifractalNoise3',
    'RidgedMultifractalNoise4',

    'RidgedAntiMultifractalNoise',
    'RidgedAntiMultifractalNoise2',
    'RidgedAntiMultifractalNoise3',
    'RidgedAntiMultifractalNoise4',

    //fractal noise
    'FractalBrownianMotion',
    'FractalBrownianMotion2',
    'FractalBrownianMotion3',
    
    'CellularBrownianMotion',
    'CellularBrownianMotion2',
    'CellularBrownianMotion3',
    
    'VoronoiBrownianMotion',
    'VoronoiBrownianMotion2',
    'VoronoiBrownianMotion3',

    //worms
    'PerlinWorms',
    'HexWorms',

    //voronoi
    'VoronoiTileNoise',
    'VoronoiFlatShadeTileNoise',
    'VoronoiCircleGradientTileNoise',
    'VoronoiCircleGradientTileNoise2',
    'VoronoiRipple3D',
    'VoronoiRipple3D2',
    'VoronoiCircularRipple3D',
    'FVoronoiRipple3D',
    'FVoronoiCircularRipple3D',

    //ripple effect
    'RippleNoise',
    'FractalRipples'
];

// Function to create a canvas and append it to the container
const createCanvas = (size, title) => {
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
    canvasWrapper.style.width = `${size}px`;
    canvasWrapper.style.height = `${size}px`;
    canvasWrapper.style.flexShrink = '0'; // Prevent the wrapper from shrinking

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.display = 'block'; // To ensure the canvas takes the full width of its container

    const context = canvas.getContext('2d');
    context.fillStyle = 'black';
    context.fillRect(0, 0, size, size);

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

            worker.postMessage({ seed, noiseConfigs, xRange, yRange, stepSize });
        }));
    }

    await Promise.all(promises);

    try {context.putImageData(imageData, 0, 0); } catch(er){console.error(er);}

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
    const shift = parseFloat(document.querySelector('#shift').value);
    const frequency = parseFloat(document.querySelector('#frequency').value);
    //const stepSize = parseFloat(document.querySelector('#stepSize').value);

    // Remove existing canvases
    container.innerHTML = '';

    for (const noiseType of noiseGenerators) {
        const noiseConfigs = [{
            type:noiseType,
            zoom,
            octaves,
            lacunarity,
            gain,
            shift,
            frequency
        }];
        const canvas = createCanvas(500, noiseType);
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

    
    controlsContainer.insertAdjacentHTML('afterbegin',`
        <div style="font-size:10px;">Seed and settings will dramatically</br> alter noise quality.</div>
    `)

    const controls = [
        { id: 'seed', label: 'Seed', type: 'number', value: 12345.678910 },
        { id: 'zoom', label: 'Zoom', type: 'number', value: 50.0 },
        { id: 'octaves', label: 'Octaves', type: 'number', value: 8 },
        { id: 'lacunarity', label: 'Lacunarity', type: 'number', value: 2.0 },
        { id: 'gain', label: 'Gain', type: 'number', value: 0.5 },
        { id: 'shift', label: 'Shift', type: 'number', value: 0 },
        { id: 'frequency', label: 'Frequency', type: 'number', value: 1 },
        //{ id: 'stepSize', label: 'Step Size', type: 'number', value: 1 }
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
        await generateCanvases();
        regenerateButton.disabled = false;
    };
    controlsContainer.appendChild(regenerateButton);

    return {container:controlsContainer, regenerateButton};
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
    }
}

export async function clearNoiseTextureRender(render) {
    render.controls.container.remove();
    render.canvasContainer.remove();

    return true;
}


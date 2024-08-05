
import './index.css';
import { createSim as createFluidSim, destroySim as destroyFluidSim } from './src/scenes/fluidvis';


//visualize the noise generators as 2d textures
import {renderNoiseTextures, clearNoiseTextureRender} from './src/scenes/noisevis'

//3d planetary terrain noise
import {planetRender, clearPlanetRender} from './src/scenes/planetscene'


//with WIP erosion sim
import { terrainRender, clearTerrainRender } from './src/scenes/terrainscene' 

import { VFieldRender, cleanupVFieldRender } from './src/scenes/vectorfieldvis';


const defaultScene = 'planet'; //'noise' 'planet' 'terrain' 'vf', 'fluid', 'tank'


let currentRender = null;

let render;

async function renderScene(option) {
    if(render) {
        if (currentRender === 'planet') {
            await clearPlanetRender(render);
        } else if (currentRender === 'terrain') {
            await clearTerrainRender(render);
        } else if (currentRender === 'noise') {
            await clearNoiseTextureRender(render);
        } else if (currentRender === 'vf') {
            await cleanupVFieldRender(render);
        } else if (currentRender === 'fluid') {
            await destroyFluidSim(render);
        }
        render = undefined;
    }
   
    if (option === 'planet') {
        render = await planetRender();
    } else if (option === 'terrain') {
        render = await terrainRender();
    } else if (option === 'noise') {
        render = await renderNoiseTextures();
    } else if (option === 'vf') {
        render = await VFieldRender();
    } else if (option === "fluid") {
        render = await createFluidSim();
    }

    currentRender = option;
}

function createRadioButton(labelText, value, defaultScene, renderSceneCallback, inputElements) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'render';
    input.value = value;
    input.checked = defaultScene === value;
    input.onchange = async () => {
        // Disable all inputs during rendering
        inputElements.forEach(element => element.disabled = true);
        await renderSceneCallback(value);
        // Enable all inputs after rendering
        inputElements.forEach(element => element.disabled = false);
    };
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${labelText}`));
    return { label, input };
}

function createRadioButtons(defaultScene) {
    const container = document.createElement('span');
    container.innerHTML = '<div>Switcher</div>';
    container.className = 'render-options';

    const renderOptions = [
        { label: '3D Planet', value: 'planet' },
        { label: 'Terrain', value: 'terrain' },
        { label: 'Noise Textures', value: 'noise' },
        { label: 'Vector Fields', value: 'vf' },
        //{ label: 'Fluid Sim', value:'fluid'}
    ];

    const inputElements = [];

    renderOptions.forEach(option => {
        const { label, input } = createRadioButton(option.label, option.value, defaultScene, renderScene, inputElements);
        inputElements.push(input);
        container.appendChild(label);
        container.appendChild(document.createElement('br'));
    });

    document.body.appendChild(container);
}


const main = async () => {

    await renderScene(defaultScene);
    // Usage
    createRadioButtons(defaultScene);


}

main();
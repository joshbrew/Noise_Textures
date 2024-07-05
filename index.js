
import './index.css';


//visualize the noise generators as 2d textures
import {renderNoiseTextures, clearNoiseTextureRender} from './src/scenes/noisevis'

//3d planetary terrain noise
import {planetRender, clearPlanetRender} from './src/scenes/planetscene'


//with WIP erosion sim
import { terrainRender, clearTerrainRender } from './src/scenes/terrainscene' 

import { VFieldRender, cleanupVFieldRender } from './src/scenes/vectorfieldvis';


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
    }

    currentRender = option;
}

function createRadioButtons(defaultScene) {
    const container = document.createElement('span');
    container.innerHTML='<div>Switcher</div>'
    container.className = 'render-options';

    const planetLabel = document.createElement('label');
    const planetInput = document.createElement('input');
    planetInput.type = 'radio';
    planetInput.name = 'render';
    planetInput.value = 'planet';
    planetInput.checked = defaultScene === planetInput.value ? true : false;
    planetInput.onchange = async () => {
        terrainInput.disabled = true;
        planetInput.disabled = true;
        noiseInput.disabled = true;
        vInput.disabled = true;
        await renderScene('planet');
        terrainInput.disabled = false;
        planetInput.disabled = false;
        noiseInput.disabled = false;
        vInput.disabled = false;
    }
    planetLabel.appendChild(planetInput);
    planetLabel.appendChild(document.createTextNode(' 3D Planet'));

    const terrainLabel = document.createElement('label');
    const terrainInput = document.createElement('input');
    terrainInput.type = 'radio';
    terrainInput.name = 'render';
    terrainInput.value = 'terrain';
    terrainInput.checked = defaultScene === terrainInput.value ? true : false;
    terrainInput.onchange = async () => {
        terrainInput.disabled = true;
        planetInput.disabled = true;
        noiseInput.disabled = true;
        vInput.disabled = true;
        await renderScene('terrain');
        terrainInput.disabled = false;
        planetInput.disabled = false;
        noiseInput.disabled = false;
        vInput.disabled = false;
    }
    terrainLabel.appendChild(terrainInput);
    terrainLabel.appendChild(document.createTextNode(' Terrain'));

    const noiseLabel = document.createElement('label');
    const noiseInput = document.createElement('input');
    noiseInput.type = 'radio';
    noiseInput.name = 'render';
    noiseInput.value = 'noise';
    noiseInput.checked = defaultScene === noiseInput.value ? true : false;
    noiseInput.onchange = async () => {
        terrainInput.disabled = true;
        planetInput.disabled = true;
        noiseInput.disabled = true;
        vInput.disabled = true;
        await renderScene('noise');
        terrainInput.disabled = false;
        planetInput.disabled = false;
        noiseInput.disabled = false;
        vInput.disabled = false;
    }
    noiseLabel.appendChild(noiseInput);
    noiseLabel.appendChild(document.createTextNode(' Noise Textures'));

    
    const vfLabel = document.createElement('label');
    const vInput = document.createElement('input');
    vInput.type = 'radio';
    vInput.name = 'render';
    vInput.value = 'vf';
    vInput.checked = defaultScene === vInput.value ? true : false;
    vInput.onchange = async () => {
        terrainInput.disabled = true;
        planetInput.disabled = true;
        noiseInput.disabled = true;
        vInput.disabled = true;
        await renderScene('vf');
        terrainInput.disabled = false;
        planetInput.disabled = false;
        noiseInput.disabled = false;
        vInput.disabled = false;
    }
    vfLabel.appendChild(vInput);
    vfLabel.appendChild(document.createTextNode(' Vector Fields'));

    container.appendChild(planetLabel);
    container.appendChild(document.createElement('br'));
    container.appendChild(terrainLabel);
    container.appendChild(document.createElement('br'));
    container.appendChild(noiseLabel);
    container.appendChild(document.createElement('br'));
    container.appendChild(vfLabel);

    document.body.appendChild(container);
}

const main = async () => {

    const defaultScene = 'planet'; //'noise' 'planet' 'terrain' 'vf'

    await renderScene(defaultScene);
    createRadioButtons(defaultScene);

}

main();
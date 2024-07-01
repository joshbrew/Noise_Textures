
import './index.css';


//visualize the noise generators as 2d textures
import {renderNoiseTextures, clearNoiseTextureRender} from './src/scenes/noisevis'

//3d planetary terrain noise
import {planetRender, clearPlanetRender} from './src/scenes/planetscene'


//with WIP erosion sim
import { terrainRender, clearTerrainRender } from './src/scenes/terrainscene' 


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
        }
        render = undefined;
    }
   
    if (option === 'planet') {
        render = await planetRender();
    } else if (option === 'terrain') {
        render = await terrainRender();
    } else if (option === 'noise') {
        render = await renderNoiseTextures();
    }

    currentRender = option;
}

function createRadioButtons() {
    const container = document.createElement('span');
    container.innerHTML='<div>Switcher</div>'
    container.className = 'render-options';

    const planetLabel = document.createElement('label');
    const planetInput = document.createElement('input');
    planetInput.type = 'radio';
    planetInput.name = 'render';
    planetInput.value = 'planet';
    planetInput.checked = true;
    planetInput.onchange = async () => {
        terrainInput.disabled = true;
        planetInput.disabled = true;
        noiseInput.disabled = true;
        await renderScene('planet');
        terrainInput.disabled = false;
        planetInput.disabled = false;
        noiseInput.disabled = false;
    }
    planetLabel.appendChild(planetInput);
    planetLabel.appendChild(document.createTextNode(' 3D Planet'));

    const terrainLabel = document.createElement('label');
    const terrainInput = document.createElement('input');
    terrainInput.type = 'radio';
    terrainInput.name = 'render';
    terrainInput.value = 'terrain';
    terrainInput.onchange = async () => {
        terrainInput.disabled = true;
        planetInput.disabled = true;
        noiseInput.disabled = true;
        await renderScene('terrain');
        terrainInput.disabled = false;
        planetInput.disabled = false;
        noiseInput.disabled = false;
    }
    terrainLabel.appendChild(terrainInput);
    terrainLabel.appendChild(document.createTextNode(' Terrain'));

    const noiseLabel = document.createElement('label');
    const noiseInput = document.createElement('input');
    noiseInput.type = 'radio';
    noiseInput.name = 'render';
    noiseInput.value = 'noise';
    noiseInput.onchange = async () => {
        terrainInput.disabled = true;
        planetInput.disabled = true;
        noiseInput.disabled = true;
        await renderScene('noise');
        terrainInput.disabled = false;
        planetInput.disabled = false;
        noiseInput.disabled = false;
    }
    noiseLabel.appendChild(noiseInput);
    noiseLabel.appendChild(document.createTextNode(' Noise Textures'));

    container.appendChild(planetLabel);
    container.appendChild(document.createElement('br'));
    container.appendChild(terrainLabel);
    container.appendChild(document.createElement('br'));
    container.appendChild(noiseLabel);

    document.body.appendChild(container);
}

const main = async () => {

    await renderScene('noise');
    createRadioButtons();

}

main();
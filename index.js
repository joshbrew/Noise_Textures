import * as BABYLON from 'babylonjs';
import * as colorGrads from './planetGradients';
import { AtmosphericScatteringPostProcess } from './atmosphericScattering';
import './index.css';
import worker from './noise.worker';

import * as noise from './noiseFunctions'

let noiseGen = new noise.BaseNoise();

//just doing this to add an async context, 
document.addEventListener('DOMContentLoaded', async function () {

    
    // Create a table to display SEED, randomizer values, and gradient name
    const infoTable = document.createElement('table');
    infoTable.style.position = 'absolute';
    infoTable.style.top = '10px';
    infoTable.style.right = '10px';
    infoTable.style.zIndex = '2';
    infoTable.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    infoTable.style.border = '1px solid black';
    infoTable.style.padding = '10px';
    infoTable.style.top = '810px';

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

    const createScene = async () => {  

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

        const segments = 1000; //sphere will have s*s vertices
        const radius = 50;

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
                workers[i] = new Worker(worker);
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
                        const { noiseValues: workerNoiseValues, coordinates: workerCoordinates, startIndex } = e.data;
                        noiseValues.set(workerNoiseValues, startIndex);
                        coordinates.set(workerCoordinates, startIndex * 3);
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

            const positions = new Float32Array(numVertices * 3);
            const normals = new Float32Array(numVertices * 3);
            const colors = new Float32Array(numVertices * 4);
            const uvs = new Float32Array(numVertices * 2);

            const indices = new Float32Array(segments * segments * 6);

            for (let lat = 0; lat <= segments; lat++) {
                for (let lon = 0; lon <= segments; lon++) {
                    const noiseIndex = lat * (segments + 1) + lon;
                    const noiseValue = noiseValues[noiseIndex];

                    const index3 = noiseIndex * 3;
                    const index4 = noiseIndex * 4;
                    const index2 = noiseIndex * 2;

                    const x = coordinates[index3];
                    const y = coordinates[index3 + 1];
                    const z = coordinates[index3 + 2];

                    const heightValue = noiseValue * 1.5;
                    const nx = x * radius + x * heightValue;
                    const ny = y * radius + y * heightValue;
                    const nz = z * radius + z * heightValue;

                    positions[index3] = nx;
                    positions[index3 + 1] = ny;
                    positions[index3 + 2] = nz;

                    normals[index3] = x;
                    normals[index3 + 1] = y;
                    normals[index3 + 2] = z;

                    const baseColor = !isNaN(noiseValue) ? getColor(noiseValue) : [1, 1, 1];
                    const [r, g, b] = baseColor;
                    colors[index4] = r / 255;
                    colors[index4 + 1] = g / 255;
                    colors[index4 + 2] = b / 255;
                    colors[index4 + 3] = 1;

                    uvs[index2] = lon / segments;
                    uvs[index2 + 1] = lat / segments;

                    const first = (lat * (segments + 1)) + lon;
                    const second = first + segments + 1;

                    let index = 6 * (lat * segments + lon);

                    indices[index] = first;
                    indices[index + 1] = second;
                    indices[index + 2] = first + 1;
                    indices[index + 3] = second;
                    indices[index + 4] = second + 1;
                    indices[index + 5] = first + 1;
                }
            }


            planet = new BABYLON.Mesh("custom", scene);
            
            const vertexData = new BABYLON.VertexData();
            vertexData.positions = positions;
            vertexData.indices = indices;
            vertexData.normals = normals;
            vertexData.colors = colors;
            vertexData.uvs = uvs;
            vertexData.applyToMesh(planet);

            const material = new BABYLON.StandardMaterial("material", scene);
            material.vertexColorEnabled = true;
            material.specularColor = new BABYLON.Color3(0.015, 0.015, 0.015);
            planet.material = material;

            material.backFaceCulling = false;
            material.freeze();

            planet.receiveShadows = true;
            planet.freezeWorldMatrix();
            shadowGenerator.addShadowCaster(planet);
            
            depthRenderer = scene.enableDepthRenderer(camera, false, true);

            atmosphere = new AtmosphericScatteringPostProcess(
                "atmospherePostProcess",
                planet,
                radius,
                radius + 8,
                pointLight,
                camera,
                depthRenderer,
                scene
            );

            return planet;
        };

       
        console.time("generated planet");
        planet = await generatePlanet();
        console.timeEnd("generated planet");

        const tableContent = `
            <tr><th>Parameter</th><th>Value</th></tr>
            <tr><td>Planet Type</td><td>: ${gradientNames[gradIdx]}</td></tr>
            <tr><td>SEED</td><td>: ${SEED}</td></tr>
            <tr><td>Randomizer 1</td><td>: ${randomizer1}</td></tr>
            <tr><td>Randomizer 2</td><td>: ${randomizer2}</td></tr>
            <tr><td>Randomizer 3</td><td>: ${randomizer3}</td></tr>
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

            let rotY = Math.sin(time);

            pcs.mesh.rotation.y -= dt;

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

    scene = await createScene();
    engine.runRenderLoop(() => {
        scene.render();
    });

    window.addEventListener('resize', () => {
        engine.resize();
    });

   // Create the button
   const button = document.createElement('button');
   button.textContent = 'Re-render Mesh';
   button.style.position = 'absolute';
   button.style.left = `${window.innerWidth - 100}px`;
   button.style.zIndex = '2';
   document.body.appendChild(button);
   button.addEventListener('click', async () => {
       button.disabled = true;
       scene.dispose();
       await createScene();
       button.disabled = false;
   });


});
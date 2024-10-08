import {
    Scene,
    WebGPUEngine,
    Color3,
    PointLight,
    StandardMaterial,
    ShadowGenerator,
    ArcRotateCamera,
    Mesh,
    PointsCloudSystem,
    VertexData,
    Vector3,
    Color4,
    HemisphericLight,
    MeshBuilder
} from 'babylonjs';


import noiseworker from '../noise.worker';
//import planetworker from '../planet.worker';
import erosionworker from '../erosion.worker';



//just doing this to add an async context, 
export async function terrainRender() {

    const container = document.createElement('span');
    container.style.height = '100%'; container.style.width = '100%';
    container.style.position = 'absolute'
    document.body.appendChild(container);

    // Create the button
    const button = document.createElement('button');
    button.textContent = 'Re-render Mesh';
    button.style.position = 'absolute';
    button.style.left = '810px';
    button.style.zIndex = '2';
    container.appendChild(button);

    const canvas3d = document.createElement('canvas');
    canvas3d.width = 800;
    canvas3d.height = 800;
    container.appendChild(canvas3d);

    const engine = new WebGPUEngine(canvas3d, { antialias: true });
    let inited = false;

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


        if(!inited) {await engine.initAsync(); inited = true;}
        const scene = new Scene(engine);
        scene.clearColor = new Color3(0, 0, 0); // Black background for the starry sky

       
        //const light = new HemisphericLight("light", new Vector3(0, 1, 0), scene);

        // Create a rotating point light
        const pointLight = new PointLight("pointLight", new Vector3(0, 50, 0), scene);
        pointLight.intensity = 10;
        pointLight.diffuse = new Color3(1, 1, 1);
        pointLight.specular = new Color3(1, 1, 1);

        // Create a sphere to represent the sun
        const sun = MeshBuilder.CreateSphere("sun", { diameter: 20 }, scene);
        sun.material = new StandardMaterial("sunMaterial", scene);
        sun.material.emissiveColor = new Color3(1, 1, 0); // Bright yellow

        // Enable shadows
        const shadowGenerator = new ShadowGenerator(2048, pointLight);
        shadowGenerator.usePercentageCloserFiltering = true

        // Create a ground mesh
        const width = 500;
        const height = 500;
    

        const camera = new ArcRotateCamera("camera", Math.PI / 2, Math.PI / 4, width*2, new Vector3(0, 0, 0), scene);
        camera.attachControl(canvas3d, true);

        
        const promises = [];
        
        const seed = 12345 + Math.random()*123;
        const octaves = 8;
        const lacunarity = 2;
        const gain = 0.5;
        const shift = 1.5;

        const noiseConfigs = [
            { type: 'FractalBrownianMotion', zoom: 1000, octaves: octaves, lacunarity: lacunarity, gain: gain, xShift: shift, yShift: shift, zShift: shift },
            { type: 'FractalBrownianMotion2', zoom: 1000, octaves: octaves, lacunarity: lacunarity, gain: gain, xShift: shift, yShift: shift, zShift: shift },
            { type: 'RidgedMultifractalNoise', zoom: 250, octaves: octaves, lacunarity: lacunarity, gain: gain, xShift: shift, yShift: shift, zShift: shift },
            { type: 'BillowNoise', zoom: 250, octaves: octaves, lacunarity: lacunarity, gain: gain, shift: shift, xShift: shift, yShift: shift, zShift: shift }
        ];


        // Split height into chunks for each worker
        
        const runNoiseWorkers = async (width, height) => {
            const map = new Float32Array(width * height); // This is our final buffer
            const maxThreads = navigator.hardwareConcurrency || 4; // Use the maximum number of available threads, default to 4
            const chunkSize = Math.ceil(height / maxThreads);
            const workers = [];
            const promises = [];
        
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
                                map[y * width + x] = heightValue; // Slight height shift
                                index++;
                            }
                        }
        
                        worker.terminate(); // Cleanup
                        resolve(true);
                    };
        
                    const xRange = { start: 0, end: width - 1 };
                    const yRange = { start: startY, end: endY };
        
                    worker.postMessage({ seed, noiseConfigs, xRange, yRange, stepSize: 1 });
                }));
            }
        
            await Promise.all(promises);
        
            return map;
        };


        const heightmap = await runNoiseWorkers(width,height);
        
        let minValue = Infinity;
        for (let i = 0; i < heightmap.length; i++) {
            if (heightmap[i] < minValue) {
                minValue = heightmap[i];
            }
        }

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
                const heightValue = heightmap[k];
                
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

        const customMesh = new Mesh("custom", scene);
        const vertexData = new VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.colors = colors;
        vertexData.uvs = uvs;
        vertexData.applyToMesh(customMesh);

        const material = new StandardMaterial("material", scene);
        material.vertexColorEnabled = true;
        material.specularColor = new Color3(0.015, 0.015, 0.015);
        customMesh.material = material;

        customMesh.receiveShadows = true;
        shadowGenerator.addShadowCaster(customMesh);

        // Create starry sky point cloud system
        const pcs = new PointsCloudSystem("pcs", 1, scene);

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

            particle.position = new Vector3(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.sin(phi) * Math.sin(theta),
                radius * Math.cos(phi)
            );

            particle.color = new Color4(Math.random(), Math.random(), Math.random(), 1);
            particle.pivot = Vector3.Zero();
        };

        pcs.addPoints(numStars, starFunc);

        pcs.buildMeshAsync().then(() => {
            pcs.mesh.isPickable = false;
            pcs.mesh.alwaysSelectAsActiveMesh = true;

            pcs.mesh.rotation.y += Math.PI/2;
        });

        // Create night light
        const nightLight = new HemisphericLight("nightLight", new Vector3(0, 1, 0), scene);
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
            pointLight.position = new Vector3(
                width * Math.cos(time),
                sunHeight,
                0
            );
            sun.position = pointLight.position; // Sync sun position with point light

            // Sun color gradient based on height
            if (rotY > 0.5) {
              pointLight.diffuse = Color3.Lerp(new Color3(1, 1, 1), new Color3(1, 0.65, 0.65), (rotY - 0.75) / 0.25);
              pointLight.specular = pointLight.diffuse;
            } else if (rotY > 0.25) {
              pointLight.diffuse = Color3.Lerp(new Color3(1, 0.65, 0.65), new Color3(1, 0.3, 0.3), (rotY - 0.5) / 0.25);
              pointLight.specular = pointLight.diffuse;
            } else if (rotY > 0.15) {
              pointLight.diffuse = Color3.Lerp(new Color3(1, 0.3, 0.3), new Color3(1, 0.08, 0.57), (rotY - 0.25) / 0.25);
              pointLight.specular = pointLight.diffuse;
            } else if (rotY > 0) {
              pointLight.diffuse = Color3.Lerp(new Color3(1, 0.08, 0.57), new Color3(0.1, 0.01, 0.44), rotY / 0.25);
              pointLight.specular = pointLight.diffuse;
            } else {
              pointLight.diffuse = Color3.Lerp(new Color3(0.1, 0.01, 0.44), new Color3(0.1, 0.1, 0.1), rotY / 0.25);
              pointLight.specular = pointLight.diffuse;
            }

            nightLight.intensity = Math.max(0.3, 0.5 - Math.abs(normalizedHeight+0.3));

            // Adjust point light intensity to blend with night light
            pointLight.intensity = Math.min(10,Math.max(0, (2 * Math.abs(normalizedHeight+0.05) - 1)*10));


        });

        return {scene, shadowGenerator};
    };


    let {scene, shadowGenerator} = await createFlatScene();//createFlatScene();//createPlanetaryScene(); 
    scene.freezeActiveMeshes();
    scene.freezeMaterials();
    //scene.freezeWorldMatrix();
    engine.runRenderLoop(() => {
        if(scene) scene.render();
    });

    engine.RESIZEEVENT = () => {
        engine.resize();
    }

    window.addEventListener('resize', engine.RESIZEEVENT);

   button.addEventListener('click', async () => {
       button.disabled = true;
       shadowGenerator.dispose();
       scene.dispose();
       ({scene, shadowGenerator} = await createFlatScene());
       button.disabled = false;
   });

   return {
        engine,
        scene,
        shadowGenerator,
        container,
        canvas:canvas3d,
        button
   }

};


export async function clearTerrainRender(render) {
    render.scene.dispose();
    window.removeEventListener('resize',render.engine.RESIZEEVENT);
    render.engine.dispose();
    render.container.remove();
}

import * as noise from './noiseFunctions'
import * as BABYLON from 'babylonjs'

import { AtmosphericScatteringPostProcess } from './atmosphericScattering';

import './index.css'



document.addEventListener('DOMContentLoaded', async function () {
    // const perlinCanvas = document.getElementById('perlinCanvas');
    // const perlinwormsCanvas =  document.getElementById('perlinwormsCanvas');
    // const hexwormsCanvas =  document.getElementById('hexwormsCanvas');
    // const billowCanvas = document.getElementById('billowCanvas');
    // const invbillowCanvas = document.getElementById('invbillowCanvas');
    // const multifractalCanvas = document.getElementById('multifractalCanvas');
    // const fbmCanvas = document.getElementById('fbmCanvas1');
    // const fbmCanvas2 = document.getElementById('fbmCanvas2');
    // const fbmCanvas3 = document.getElementById('fbmCanvas3');

    // const perlinCtx = perlinCanvas.getContext('2d');
    // const perlinwormsCtx = perlinwormsCanvas.getContext('2d');
    // const hexwormsCtx =  hexwormsCanvas.getContext('2d');
    // const billowCtx = billowCanvas.getContext('2d');
    // const invbillowCtx = invbillowCanvas.getContext('2d');
    // const multifractalCtx = multifractalCanvas.getContext('2d');
    // const fbmCtx = fbmCanvas.getContext('2d');
    // const fbmCtx2 = fbmCanvas2.getContext('2d');
    // const fbmCtx3 = fbmCanvas3.getContext('2d');

    // const width = perlinCanvas.width;
    // const height = perlinCanvas.height;

    // const zoom = 50; // Adjust zoom for more zoomed-in noise pattern
    // const octaves = 6; // Number of octaves for the noise
    // const lacunarity = 2; // Lacunarity for the noise
    // const gain = 0.5; // Gain for the noise
    // const shift = 200; //domain shift

    // const perlinHeightmap = new Float32Array(width * height);
    // const perlinwormsHeightmap = new Float32Array(width * height);
    // const hexwormsHeightmap = new Float32Array(width * height);
    // const billowHeightmap = new Float32Array(width * height);
    // const invbillowHeightmap = new Float32Array(width * height);
    // const ridgedHeightmap = new Float32Array(width * height);
    // const fbmHeightmap = new Float32Array(width * height);
    // const fbmHeightmap2 = new Float32Array(width * height);
    // const fbmHeightmap3 = new Float32Array(width * height);

    const perlin = new noise.PerlinNoise(12345); // Set a seed for reproducibility
    const perlinworms = new noise.PerlinWorms(12345); // Set a seed for reproducibility
    const hexworms = new noise.HexWorms(12345); // Set a seed for reproducibility
    const billow = new noise.LanczosBillowNoise(12345); // Set a seed for reproducibility
    const invbillow = new noise.LanczosAntiBillowNoise(12345); // Set a seed for reproducibility
    const ridged = new noise.RidgedMultifractalNoise(12345); // Set a seed for reproducibility
    const fbm = new noise.FractalBrownianMotion(12345); // Set a seed for reproducibility
    const fbm2 = new noise.FractalBrownianMotion2(12345); // Set a seed for reproducibility
    const fbm3 = new noise.FractalBrownianMotion3(12345); // Set a seed for reproducibility

    // Define a set of gradient colors
    // Define a set of gradient colors
    const gradientColors = [
        [0, 0, 51],     // Dark blue
        [0, 0, 151],     // Lighter blue
        [0, 0, 151],     // Lighter blue
        [255, 178, 102],// Light orange
        [0, 51, 0],     // Dark green
        [117, 181, 130],     // sage green
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
        [0, 51, 0],     // Dark green
        [57, 181, 50],     // Light green
        [153, 51, 0],   // Medium dark brown
        [102, 51, 0],   // Dark brown
        [51, 25, 0],    // Very dark brown
        [153, 76, 0],   // Darker orange
        [204, 102, 0],  // Dark orange
        [20, 99, 56],     // pine green
        [117, 181, 130],     // sage green
        [20, 99, 56],     // pine green
        [255, 128, 0],  // Medium dark orange
        [255, 178, 102],// Light orange
    ];

    // Function to interpolate between two colors
    const interpolateColor = (color1, color2, factor) => {
        return color1.map((c, i) => Math.round(c + factor * (color2[i] - c)));
    };

    // Function to map noise values to the gradient
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

        const factor = scaledValue - lowerIndex;

        return interpolateColor(gradientColors[lowerIndex], gradientColors[upperIndex], factor);
    };

    // Function to adjust color brightness
    const adjustBrightness = (color, factor) => {
        return color.map(c => Math.round(c * (factor)));
    };

    // let iterateCanvas = async (
    //   noiseGen,
    //   heightmap,
    //   ctx,
    //   zoom,
    //   octaves,
    //   lacunarity,
    //   gain,
    //   shift
    // ) => {
    //   // Create an ImageData object
    //   const imageData = ctx.createImageData(width, height);
    //   const data = imageData.data;

    //   for (let y = 0; y < height; y++) {
    //     for (let x = 0; x < width; x++) {
    //       // Generate Perlin noise
    //       const noiseValue = noiseGen.generateNoise(x, y, 0, zoom, octaves, lacunarity, gain, shift); // 2D
    //       heightmap[y * width + x] = noiseValue;

    //       //const baseColor = getColor(noiseValue);
    //       const brightnessFactor = (noiseValue + 1) * 0.5;

    //       const instensity = Math.floor(brightnessFactor*255);

    //       const [r, g, b] = [instensity,instensity,instensity]//adjustBrightness(baseColor, brightnessFactor);
    //       const index = (y * width + x) * 4;
    //       data[index] = r; // Red
    //       data[index + 1] = g; // Green
    //       data[index + 2] = b; // Blue
    //       data[index + 3] = 255; // Alpha
    //     }
    //   }

    //   // Put the ImageData back to the canvas
    //   ctx.putImageData(imageData, 0, 0);

    //   return true;
    // }


    // let wait = (time=50) => {
    //   return new Promise((res) => {setTimeout(()=>{res(true)},time)})
    // }



    // await iterateCanvas(perlin,perlinHeightmap,perlinCtx,zoom,octaves,lacunarity,gain,shift);
    // await wait();
    // await iterateCanvas(billow,billowHeightmap,billowCtx, zoom,octaves,lacunarity,gain,shift);
    // await wait();
    // await iterateCanvas(invbillow,invbillowHeightmap,invbillowCtx, zoom,octaves,lacunarity,gain,shift);
    // await wait();
    // await iterateCanvas(ridged,ridgedHeightmap,multifractalCtx, zoom,octaves,lacunarity,gain,shift);
    // await wait();
    // await iterateCanvas(fbm,fbmHeightmap,fbmCtx, zoom,octaves,lacunarity,gain,shift);
    // await wait();
    // await iterateCanvas(fbm2,fbmHeightmap2,fbmCtx2, zoom,octaves,lacunarity,gain,shift);
    // await wait();
    // await iterateCanvas(fbm3,fbmHeightmap3,fbmCtx3, zoom,octaves,lacunarity,gain,shift);
    // await wait();
    // await iterateCanvas(perlinworms,perlinwormsHeightmap,perlinwormsCtx,zoom,octaves,lacunarity,gain,shift);
    // await wait();
    // await iterateCanvas(hexworms,hexwormsHeightmap,hexwormsCtx,zoom,octaves,lacunarity,gain,shift);
    // await wait();


    //   console.log('Perlin Heightmap:', perlinHeightmap);
    //   console.log('Billow Heightmap:', billowHeightmap);
    //   console.log('Ridged Heightmap:', ridgedHeightmap);
    //   console.log('FBM Heightmap:', fbmHeightmap);



    const canvas3d = document.createElement('canvas');
    canvas3d.width = 800;
    canvas3d.height = 800;

    document.body.appendChild(canvas3d);
    const engine = new BABYLON.WebGPUEngine(canvas3d, { antialias: true });

    const createScene = async () => {
        await engine.initAsync({antialias:true})
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color3(0, 0, 0); // Black background for the starry sky


        // Parameters for the sphere
        const segments = 1000; //sphere will have s*s vertices
        const radius = 50;


        const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 4, radius*5, new BABYLON.Vector3(0, 0, 0), scene);
        camera.attachControl(canvas3d, true);
        const depthRenderer = scene.enableDepthRenderer(camera, false, true);
        
   

        // Create a rotating point light
        const pointLight = new BABYLON.PointLight("pointLight", new BABYLON.Vector3(0, 50, 0), scene);
        pointLight.intensity = 10;
        pointLight.diffuse = new BABYLON.Color3(1, 1, 1);
        pointLight.specular = new BABYLON.Color3(1, 1, 1);

        // Create a sphere to represent the sun
        const sun = BABYLON.MeshBuilder.CreateSphere("sun", { diameter: 5 }, scene);
        sun.material = new BABYLON.StandardMaterial("sunMaterial", scene);
        sun.material.emissiveColor = new BABYLON.Color3(1, 1, 0); // Bright yellow

        // Enable shadows
        const shadowGenerator = new BABYLON.ShadowGenerator(4096, pointLight);
        shadowGenerator.usePercentageCloserFiltering = true;


        // Generate Perlin noise
        const noiseGen = fbm; // Replace with your noise generator

        // Create custom mesh
        const positions = [];
        const normals = [];
        const indices = [];
        const colors = [];
        const uvs = [];

        // Generate positions, normals, and uvs

        let offset = noiseGen.seededRandom() * 0.3; //will add more tectonic influence
        let offset2 = noiseGen.seededRandom() * 0.1; //will add more tectonic influence
        let sign = noiseGen.seededRandom() - 0.5;
        let sign2 = noiseGen.seededRandom() - 0.5;
        if(sign < 0) sign = -1;
        else sign = 1;
        offset *= sign;
        if(sign2 < 0) sign2 = -1;
        else sign2 = 1;
        offset2 *= sign2;

        for (let lat = 0; lat <= segments; lat++) {
            const theta = lat * Math.PI / segments;
            const poleScaleLat = Math.sin(theta);

            for (let lon = 0; lon <= segments; lon++) {
                const phi = lon * 2 * Math.PI / segments;
                const poleScaleLon = Math.sin(phi);

                // Spherical coordinates to Cartesian coordinates
                const x = Math.sin(theta) * Math.cos(phi);
                const y = Math.sin(theta) * Math.sin(phi);
                const z = Math.cos(theta);

                // Add complex variations and offsets to noise coordinates with scaling
                let noiseX = x + 2 + poleScaleLat * poleScaleLon * (offset * Math.sin(phi + theta) + offset2 * Math.cos(2 * phi));
                let noiseY = y + 2 + poleScaleLat * poleScaleLon * (offset * Math.cos(theta + phi) + offset2 * Math.sin(2 * theta));
                let noiseZ = z + 2 + poleScaleLat * poleScaleLon * (offset * Math.sin(2 * phi + theta) + offset2 * Math.cos(2 * theta + phi));
                // Increase variation near poles by adjusting the frequency of the noise
                //const frequency = 1 + 0.1 * (1 - poleScaleLat);  // Increase frequency near poles and symmetry line

                let zoomMul = 1.3; //this will basically remove high frequency detail as we zoom in, making lower divisions better looking

                const noiseValue = noiseGen.generateNoise(noiseX, noiseY, noiseZ, zoomMul*0.8, 6, 2.0, 0.5, 0, 1) -
                    fbm2.generateNoise(noiseX, noiseY, noiseZ, zoomMul*1, 8, 2, 0.5, 0, 1) +
                    ridged.generateNoise(noiseX, noiseY, noiseZ, zoomMul*0.5, 6, 2.0, 0.5, 0, 1) +
                    billow.generateNoise(noiseY, noiseX, noiseZ, zoomMul*0.5, 6, 2.0, 0.5, 0, 1) * 1.2 - 0.2;

                const heightValue = noiseValue * 1.5; // Adjust the multiplier as needed
                const nx = x * radius + x * heightValue;
                const ny = y * radius + y * heightValue;
                const nz = z * radius + z * heightValue;

                positions.push(nx, ny, nz);
                normals.push(x, y, z); // Normalized coordinates for the normals
                const baseColor = !isNaN(noiseValue) ? getColor(noiseValue) : [1, 1, 1];
                const [r, g, b] = baseColor;
                colors.push(r / 255, g / 255, b / 255, 1);
                uvs.push(lon / segments, lat / segments);
            }
        }

        // Generate indices
        for (let lat = 0; lat < segments; lat++) {
            for (let lon = 0; lon < segments; lon++) {
                const first = (lat * (segments + 1)) + lon;
                const second = first + segments + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        const planet = new BABYLON.Mesh("custom", scene);
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.normals = normals; // Apply normals
        vertexData.colors = colors;
        vertexData.uvs = uvs;
        vertexData.applyToMesh(planet);

        const material = new BABYLON.StandardMaterial("material", scene);
        material.vertexColorEnabled = true;
        material.specularColor = new BABYLON.Color3(0.015, 0.015, 0.015);
        planet.material = material;

        material.backFaceCulling = false;

        planet.receiveShadows = true;
        shadowGenerator.addShadowCaster(planet);

             
        const atmosphere = new AtmosphericScatteringPostProcess(
            "atmospherePostProcess", 
            planet, 
            radius, 
            radius+8, 
            pointLight, 
            camera, 
            depthRenderer, 
            scene
        );


        // Create starry sky point cloud system
        const pcs = new BABYLON.PointsCloudSystem("pcs", 1, scene);

        const starDistance = radius*8; // Maximum distance from the center of the terrain
        const minStarDistance = radius*6; // Minimum distance from the center of the terrain
        const numStars = 20000;

        const gaussianRandom = (mean = 0, stdev = 1) => {
            let u = 1 - Math.random(); // Converting [0,1) to (0,1)
            let v = Math.random();
            let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
            return z * stdev + mean;
        };

        const starFunc = (particle) => {
            let theta, phi;

            if (Math.random() < 0.75) {
                theta = Math.random() * Math.PI * (1.5 + Math.random() * 0.5);

                const verticalOffset = gaussianRandom(0, Math.PI / 16);
                const sharpClustering = gaussianRandom(0, Math.PI / 48);

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

        // Create night light
        const nightLight = new BABYLON.HemisphericLight("nightLight", new BABYLON.Vector3(0, 1, 0), scene);
        nightLight.intensity = 0.2;

        // Animate the point light
        let prevTime = performance.now() * 0.000125;
        scene.registerBeforeRender(() => {
            const time = performance.now() * 0.000125;
            const dt = time - prevTime;
            prevTime = time;

            let rotY = Math.sin(time);
            const sunHeight = 3 * radius * rotY;
            const normalizedHeight = (sunHeight + 2 * radius) / (2 * radius);

            pcs.mesh.rotation.x -= dt;

            // if (rotY < 0.01 && sphere.receiveShadows) {
            //     sphere.receiveShadows = false;
            // } else if (rotY > 0.01 && !sphere.receiveShadows) {
            //   sphere.receiveShadows = true;
            // }

            pointLight.position = new BABYLON.Vector3(
                10 * radius * Math.cos(time),
                10 * radius * rotY,
                0
            );

            sun.position = new BABYLON.Vector3(
                3 * radius * Math.cos(time),
                3 * radius * rotY,
                0
            );

            // if (rotY > 0.5) {
            //     pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(1, 1, 1), new BABYLON.Color3(1, 0.65, 0.65), (rotY - 0.75) / 0.25);
            //     pointLight.specular = pointLight.diffuse;
            // } else if (rotY > 0.25) {
            //     pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(1, 0.65, 0.65), new BABYLON.Color3(1, 0.3, 0.3), (rotY - 0.5) / 0.25);
            //     pointLight.specular = pointLight.diffuse;
            // } else if (rotY > 0.15) {
            //     pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(1, 0.3, 0.3), new BABYLON.Color3(1, 0.08, 0.57), (rotY - 0.25) / 0.25);
            //     pointLight.specular = pointLight.diffuse;
            // } else if (rotY > 0) {
            //     pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(1, 0.08, 0.57), new BABYLON.Color3(0.1, 0.01, 0.44), rotY / 0.25);
            //     pointLight.specular = pointLight.diffuse;
            // } else {
            //     pointLight.diffuse = BABYLON.Color3.Lerp(new BABYLON.Color3(0.1, 0.01, 0.44), new BABYLON.Color3(0.1, 0.1, 0.1), rotY / 0.25);
            //     pointLight.specular = pointLight.diffuse;
            // }

            // nightLight.intensity = Math.max(0.3, 0.5 - Math.abs(normalizedHeight + 0.3));
            // pointLight.intensity = Math.min(10, Math.max(0, (2 * Math.abs(normalizedHeight + 0.05) - 1) * 10));
        });

        return scene;
    };

    const scene = await createScene();
    engine.runRenderLoop(() => {
        scene.render();
    });

    window.addEventListener('resize', () => {
        engine.resize();
    });;



});
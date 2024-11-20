import wrkr from '../delaunay_flow/delaunay.worker';
import * as BABYLON from 'babylonjs';


let is3D = false;
let useOverlay = true;
let engine = null;
let scene = null;
let heightmapMesh = null;
let canvas3D = null;
let rendered2d = false;


export async function makeRiverNetwork() {
    const npts = 40000;
    const gridWidth = 200;
    const gridHeight = 200;

    const container = document.createElement('span');
    const canvas = document.createElement('canvas');
    const progressDiv = document.createElement('div');
    const resetButton = document.createElement('button');
    const toggle3DButton = document.createElement('button');
    const toggleOverlayButton = document.createElement('button');

    container.appendChild(canvas);
    container.appendChild(progressDiv);

    progressDiv.style.position = 'absolute';
    progressDiv.style.top = '90vh';

    canvas.width = 2400;
    canvas.height = 2400;
    canvas.style.height = '90vh';

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    resetButton.innerHTML = "Regenerate";
    container.appendChild(resetButton);
    resetButton.style.position = 'absolute';
    resetButton.style.top = '90vh';
    resetButton.style.left = '10vh';

    toggle3DButton.innerHTML = "Toggle 3D View";
    container.appendChild(toggle3DButton);
    toggle3DButton.style.position = 'absolute';
    toggle3DButton.style.top = '90vh';
    toggle3DButton.style.left = '20vh';

    toggleOverlayButton.innerHTML = "Toggle Canvas Overlay";
    container.appendChild(toggleOverlayButton);
    toggleOverlayButton.style.position = 'absolute';
    toggleOverlayButton.style.top = '90vh';
    toggleOverlayButton.style.left = '30vh';

    document.body.appendChild(container);

    const worker = new Worker(wrkr);

    let meshBuffer, edges, pts;

  

    function render2D() {
        ctx.clearRect(0, 0, width, height);
        ctx.lineCap = 'round';

        const scaleX = (x) => x * (width - 20) + 10;
        const scaleY = (y) => (1 - y) * (height - 20) + 10;

        const weights = edges.map((edge) => edge.weight);
        const minWeight = Math.min(...weights);
        const maxWeight = Math.max(...weights);

        const getColor = (weight) => {
            const normalized = (weight - minWeight) / (maxWeight - minWeight);
            const baseGreen = [144, 238, 255];
            const r = baseGreen[0] - Math.round(50 * (1 - normalized));
            const g = baseGreen[1] + Math.round(50 * normalized);
            const b = baseGreen[2] - Math.round(100 * normalized);
            return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
        };

        edges.forEach((edge) => {
            const source = pts[edge.source];
            const target = pts[edge.target];
            const x1 = scaleX(source[0]);
            const y1 = scaleY(source[1]);
            const x2 = scaleX(target[0]);
            const y2 = scaleY(target[1]);
            const weight = edge.weight;
            const lineWidth = Math.sqrt(weight) / 4;
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = getColor(weight);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        });
        rendered2d = true;
    }

    async function render3D() {
        // Switch to 3D: Initialize 3D rendering
        if(!rendered2d) {
            render2D();
            rendered2d = true;
        }
        if (!engine) {
            canvas3D = document.createElement('canvas');
            canvas3D.width = 800;
            canvas3D.height = 800;
            container.appendChild(canvas3D);
    
            engine = new BABYLON.WebGPUEngine(canvas3D, { antialias: true });
            await engine.initAsync();
            scene = new BABYLON.Scene(engine);
    
            const camera = new BABYLON.ArcRotateCamera(
                "camera",
                Math.PI / 4,
                Math.PI / 3,
                200,
                new BABYLON.Vector3(0, 0, 0),
                scene
            );
            camera.attachControl(canvas3D, true);
    
            const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    
            const positions = [];
            const indices = [];
            const uvs = [];
            const colors = [];
            const scale = 1000;
    
            const gridSize = Math.sqrt(meshBuffer.length / 3);
            let centerX = 0, centerY = 0, centerZ = 0;
    
            // Compute vertex positions and accumulate center coordinates
            for (let i = 0; i < meshBuffer.length; i += 3) {
                const x = meshBuffer[i];
                const y = meshBuffer[i + 1];
                const z = meshBuffer[i + 2];
    
                centerX += x;
                centerY += y;
                centerZ += z;
    
                positions.push(x, z * scale, y); // Temporarily push uncentered positions
    
                const col = i / 3 % gridSize;
                const row = Math.floor(i / 3 / gridSize);
                uvs.push(col / (gridSize), row / (gridSize));
    
                colors.push(0.5, 0.8, 0.5, 1);
            }
    
            // Calculate the geometric center
            centerX /= gridSize * gridSize;
            centerY /= gridSize * gridSize;
            centerZ /= gridSize * gridSize;
    
            // Center the positions
            for (let i = 0; i < positions.length; i += 3) {
                positions[i] -= centerX;     // Center X
                positions[i + 1] -= centerZ * scale; // Center Z (scaled for height)
                positions[i + 2] -= centerY; // Center Y
            }
    
            // Generate indices for the mesh
            for (let row = 0; row < gridSize - 1; row++) {
                for (let col = 0; col < gridSize - 1; col++) {
                    const topLeft = row * gridSize + col;
                    const topRight = topLeft + 1;
                    const bottomLeft = (row + 1) * gridSize + col;
                    const bottomRight = bottomLeft + 1;
    
                    indices.push(topLeft, topRight, bottomLeft);
                    indices.push(topRight, bottomRight, bottomLeft);
                }
            }
    
            // Create and apply vertex data to the mesh
            heightmapMesh = new BABYLON.Mesh("heightmap", scene);
            const vertexData = new BABYLON.VertexData();
            vertexData.positions = positions;
            vertexData.indices = indices;
            vertexData.uvs = uvs;
            vertexData.colors = colors;
            vertexData.applyToMesh(heightmapMesh);
    
            useOverlay ? applyOverlayMaterial(heightmapMesh, canvas) : applyDefaultMaterial(heightmapMesh);
    
            engine.runRenderLoop(() => scene.render());
    
            window.addEventListener("resize", () => engine.resize());
        }
    }
    

    function applyOverlayMaterial(mesh, canvas) {
        const texture = new BABYLON.DynamicTexture("dynamicTexture", canvas, scene, false);
        texture.update();
        const material = new BABYLON.StandardMaterial("overlayMaterial", scene);
        material.diffuseTexture = texture;
        material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        mesh.material = material;
    }

    function applyDefaultMaterial(mesh) {
        const material = new BABYLON.StandardMaterial("riverMaterial", scene);
        material.diffuseColor = new BABYLON.Color3(0, 0, 1);
        material.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        mesh.material = material;
    }

 

    resetButton.onclick = async () => {
        rendered2d=false;
        cleanup3D();
        await deleteRiverNetwork({ container, worker });
        await makeRiverNetwork();
    };


    const render = async () => {
        console.log(is3D);
        if (!is3D) {
            // Switch to 2D: Clean up 3D resources
            cleanup3D();
            render2D();
        } else {
            await render3D(); 
            useOverlay ? applyOverlayMaterial(heightmapMesh, canvas) : applyDefaultMaterial(heightmapMesh);
        }
    }

    toggle3DButton.onclick = () => {
        is3D = !is3D;
        render();
    };

    toggleOverlayButton.onclick = () => {
        useOverlay = !useOverlay;
        useOverlay ? applyOverlayMaterial(heightmapMesh, canvas) : applyDefaultMaterial(heightmapMesh);
         
    };

    worker.onmessage = async function (event) {
        const data = event.data;
        if (data.type === 'progress') {
            progressDiv.textContent = data.message;
        } else if (data.type === 'result') {
            ({ heightBuffer, edges, pts, meshBuffer } = data);
            await render();
            progressDiv.textContent = 'Rendering complete.';
            worker.terminate();
        }
    };

    worker.postMessage({ 
        type: 'start', 
        npts,
        seed1: 1122828271, 
        seed2: 1075380921 + Date.now(),
        width: gridWidth,
        height: gridHeight
    });

    return { container, canvas, ctx, worker };
}



export async function deleteRiverNetwork({ container, worker }) {
    cleanup3D();
    rendered2d = false;
    container?.remove();
    worker?.terminate();
}

function cleanup3D() {
    if (engine) {
        engine.stopRenderLoop();
        scene.dispose();
        engine.dispose();
        canvas3D?.remove();
        engine = null;
        scene = null;
        heightmapMesh = null;
        canvas3D = null;
    }
}
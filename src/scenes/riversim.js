import wrkr from '../delaunay_flow/delaunay.worker'


export async function makeRiverNetwork() {

    const container = document.createElement('span');

    const canvas = document.createElement('canvas');
    const progressDiv = document.createElement('div');
    container.appendChild(canvas);
    container.appendChild(progressDiv);
    document.body.appendChild(container);
    canvas.width = 2400;
    canvas.height = 2400;
    canvas.style.height = '90vh';

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Retrieve the worker script from the script tag
    // const workerScriptContent = document.getElementById('worker-script').textContent;
    
    // Create a Blob URL for the worker
    // const blob = new Blob([workerScriptContent], { type: 'application/javascript' });
    // const workerURL = URL.createObjectURL(blob);

    // Create a new Web Worker
    const worker = new Worker(wrkr);

    // Receive messages from the worker
    worker.onmessage = function (event) {
        const data = event.data;
        if (data.type === 'progress') {
            // Update progress
            progressDiv.textContent = data.message;
        } else if (data.type === 'result') {
            // Draw the river network
            drawRiverNetwork(data.edges, data.pts);
            progressDiv.textContent = 'Rendering complete.';
            // Revoke the Blob URL
            worker.terminate();
        }
    };

    // Send a message to start computation
    worker.postMessage({ type: 'start', npts: 40000 });

    function drawRiverNetwork(edges, pts) {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = '#1f77b4';
        ctx.lineCap = 'round';

        // Scale points to canvas size
        const scaleX = x => x * (width - 20) + 10;
        const scaleY = y => (1 - y) * (height - 20) + 10;

        // Draw edges
        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            const source = pts[edge.source];
            const target = pts[edge.target];

            const x1 = scaleX(source[0]);
            const y1 = scaleY(source[1]);
            const x2 = scaleX(target[0]);
            const y2 = scaleY(target[1]);

            const weight = edge.weight;
            const lineWidth = Math.sqrt(weight) / 4;
            ctx.lineWidth = lineWidth;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }

    return {
        container,
        canvas,
        ctx,
        worker
    };
}

export async function deleteRiverNetwork(options) {
    options.container?.remove();
    options.worker?.terminate(); //if not terminated
}

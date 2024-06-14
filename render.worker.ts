import * as noise from './noiseFunctions'
import * as BABYLON from 'babylonjs'

import { AtmosphericScatteringPostProcess } from './atmosphericScattering';

import worker from './noise.worker'


import { workerCanvasRoutes, CanvasProps } from 'workercanvas';

//minimal web worker for running offscreen canvases, 

declare var WorkerGlobalScope;

if(typeof WorkerGlobalScope !== 'undefined') {

    const routes = {
        ...workerCanvasRoutes,
        receiveBabylonCanvas:function(options:CanvasProps){ //modified canvas receiver that installs desired threejs modules
                const BABYLONprops = { //e.g. install these systems to 'self', which is the worker canvas
                    BABYLON,
                    AtmosphericScatteringPostProcess,
                    noise
                }

                Object.assign(options, BABYLONprops); //install desired props to our canvas's 'self' reference

                //console.log(this);
                let renderId = routes.setupCanvas(options); //the the base canvas tools do the rest, all ThreeJS tools are on self, for self contained ThreeJS renders
                //you can use the canvas render loop by default, or don't provide a draw function and just use the init and the Three animate() callback

                //let canvasopts = this.graph.CANVASES[renderId] as WorkerCanvas;

                return renderId;
            }
        //add more compatible routes that don't require graphscript
    };
    
    self.onmessage = (ev) => {
        if(ev.data.route) {
            if(Array.isArray(ev.data.args)) {
                routes[ev.data.route](...ev.data.args);
            } else routes[ev.data.route](ev.data.args);
        } //that's it! The functions handle worker communication internally
    
    }
    
}

export default self as any;

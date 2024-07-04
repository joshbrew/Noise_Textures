import { VectorFieldGenerator } from "../vectorfields";

export const VFieldRender = async () => {
    // Example usage
  
    const cc = document.createElement('div');
    const container = document.createElement('div');
    const container2 = document.createElement('div');
    const container3 = document.createElement('div');
    const container4 = document.createElement('div');
    document.body.appendChild(cc);
    cc.appendChild(container);
    cc.appendChild(container2);
    cc.appendChild(container3);
    cc.appendChild(container4);
    container2.style.position = 'absolute';
    container2.style.left = '510px';
    container3.style.position = 'absolute';
    container3.style.top = '500px';
    container4.style.position = 'absolute';
    container4.style.top = '500px';
    container4.style.left = '500px';
  
    
    const noiseConfigs1 = [
      {
        type: 'VoronoiTileNoise',
        zoom: 200.0,
        octaves: 3,
        lacunarity: 2.0,
        gain: 0.5,
        shift: 0,
        frequency: 1,
      },
      {
        type: 'VoronoiTileNoise',
        zoom: 50.0,
        scalar:0.2,
        octaves: 3,
        lacunarity: 2.0,
        gain: 0.5,
        shift: 0,
        frequency: 1,
      }
    ];
  
    const stepSize = 1;
    const seed = 12345.67891;///Math.floor(Math.random() * 10000);
  
    const vf2dGridSize = 200
  
    const vectorFieldGen2D = new VectorFieldGenerator(2, vf2dGridSize, vf2dGridSize);
    await vectorFieldGen2D.generateFlowField(seed, noiseConfigs1, stepSize, true);
    await vectorFieldGen2D.visualizeVectorField2D(container);
  
    const pvectorFieldGen2D = new VectorFieldGenerator(2, vf2dGridSize, vf2dGridSize);
    await pvectorFieldGen2D.generateFlowField(seed, noiseConfigs1, stepSize, true);
    await pvectorFieldGen2D.visualizeVectorField2D(container2, {
      nParticles: 5000,
      windDirection: [1, 1],
      initialSpeedRange: [0.7, 1],
      maxVelocity: 1,
      minVelocity: 0.001, //terminate path
      maxSteps: 100,
      randomTerminationProb: 0.01,
      startPositions: [[0, 0]],//, [0, 25], [25, 0], [5, 0], [0, 5], [0, 10], [10, 0], [15, 0], [0, 15]],
      variance: vf2dGridSize, //randomly seed over entire 50x50 grid from 0,0 position
      randomDistribution: true, //random or even distribution?
      vectorMul: 2,
      windMul: 0.75,
      curlStrength: 0.25,
      randomInitialDirection: false,
      seed,
      clusteredVariance:true,
      clusters: 500
    }, true);
  
  
    const noiseConfigs2 = [
      {
        type: 'BillowNoise',
        zoom: 250.0,
        octaves: 8,
        lacunarity: 2.0,
        gain: 0.5,
        shift: 0,
        frequency: 1,
      }
    //   {
    //     type: 'RidgedAntiMultifractalNoise4',
    //     zoom: 50.0,
    //     octaves: 6,
    //     lacunarity: 2.0,
    //     gain: 0.5,
    //     shift: 0,
    //     frequency: 1,
    //   },
    ];
  
  
    const vectorFieldGen3D = new VectorFieldGenerator(3, 30, 30, 30);
    await vectorFieldGen3D.generateFlowField(seed, noiseConfigs2, stepSize, true);
    await vectorFieldGen3D.visualizeVectorField3D(container3);
  
    // Add particle visualization in 3D
    const pvectorFieldGen3D = new VectorFieldGenerator(3, 30, 30, 30);
    await pvectorFieldGen3D.generateFlowField(seed, noiseConfigs2, stepSize, true);
    await pvectorFieldGen3D.visualizeVectorField3D(container4, {
      nParticles: 500,
      windDirection: [1, 0, 1],
      initialSpeedRange: [0.1, 0.2, 0.2],
      maxVelocity: 1,
      minVelocity: 0.00, //terminate path
      maxSteps: 100,
      randomTerminationProb: 0.01,
      startPositions: [[0, 15, 0]],
      variance: 5, //randomly seed over entire 20x20x20 grid from 0,0,0 position
      randomDistribution: true, //random or even distribution?
      vectorMul: 1,
      windMul: 1,
      curlStrength: 0.25,
      randomInitialDirection: false,
      seed,
      clusteredVariance:true,
      clusters: 10
    });
  
  
    return {vectorFieldGen2D, vectorFieldGen3D, pvectorFieldGen2D, pvectorFieldGen3D, container: cc};
  }
  
  export const cleanupVFieldRender = async (scene) => {
      scene.vectorFieldGen2D.cleanup();
      scene.pvectorFieldGen2D.cleanup();
      scene.vectorFieldGen3D.cleanup();
      scene.pvectorFieldGen3D.cleanup();
      scene.container.remove();
  }
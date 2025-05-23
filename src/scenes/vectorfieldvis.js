import { VectorFieldGenerator } from "../vectorfields";

export const VFieldRender = async () => {
    // Example usage
  
    const cc = document.createElement('div');
    const container = document.createElement('div');
    const container2 = document.createElement('div');
    const container3 = document.createElement('div');
    const container4 = document.createElement('div');
    const container5 = document.createElement('div');
    document.body.appendChild(cc);
    cc.appendChild(container);
    cc.appendChild(container2);
    cc.appendChild(container3);
    cc.appendChild(container4);
    cc.appendChild(container5);
    container.style.position = 'absolute';
    container.style.left = '10px';
    container2.style.zIndex = '2';
    container2.style.position = 'absolute';
    container2.style.left = '10px';
    container3.style.position = 'absolute';
    container3.style.left = '510px';
    container4.style.position = 'absolute';
    container4.style.left = '1020px';
    container5.style.position = 'absolute';
    container5.style.left = '1530px';
  
    //more natural
    const noiseConfigs1 = [
      {
        type: 'RidgedMultifractalNoise3',
        zoom: 200.0,
        octaves: 2,
        lacunarity: 2.0,
        gain: 0.5,
        shift: 0,
        frequency: 1,
        transform: 0.75,
        scalar:2
      },
      {
        type: 'FractalBrownianMotion2',
        zoom: 100.0,
        scalar:0.05,
        octaves: 4,
        lacunarity: 2.0,
        gain: 0.5,
        shift: 0,
        frequency: 1
      },
      {
        type: 'LanczosBillowNoise',
        zoom: 200.0,
        scalar:1,
        octaves: 2,
        lacunarity: 2.0,
        gain: 0.5,
        shift: 190,
        frequency: 1
      }
    ];

    //more geometric
    const noiseConfigs2 = [
      {
        type: 'VoronoiTileNoise',
        zoom: 400.0,
        octaves: 1,
        lacunarity: 2.0,
        gain: 0.5,
        shift: 0,
        frequency: 1,
        transform: 1,
        scalar:4
      },
      {
        type: 'VoronoiTileNoise',
        zoom: 200.0,
        scalar:1,
        octaves: 3,
        lacunarity: 2.0,
        gain: 0.5,
        shift: 0,
        frequency: 1,
        transform: 0.25
      },
    ];
  
    const stepSize = 1;
    const seed = Math.random()*10000+12345.67891;//seeds make terrain and particle results deterministic
  
    const vf2dGridSize = 400;
  
    const vectorFieldGen2D = new VectorFieldGenerator(2, vf2dGridSize, vf2dGridSize);
    await vectorFieldGen2D.generateFlowField(seed, noiseConfigs2, stepSize, true);
    await vectorFieldGen2D.visualizeVectorField2D(container);

    vectorFieldGen2D.canvas2D.style.backgroundColor = 'black';
  
    const simParams2d = {
      nParticles: 5000,
      clusteredVariance:true,
      clusters: 500,
      windDirection: [1, 1],
      initialSpeedRange: [0.7, 1],
      maxVelocity: 1,
      minVelocity: 0.001, //terminate path
      maxSteps: 300,
      randomTerminationProb: 0.01,
      startPositions: [[0, 0]],//, [0, 25], [25, 0], [5, 0], [0, 5], [0, 10], [10, 0], [15, 0], [0, 15]],
      variance: vf2dGridSize, //randomly seed over entire 50x50 grid from 0,0 position
      randomDistribution: true, //random or even distribution?
      vectorMul: 2,
      windMul: 0.3,
      curlStrength: 0.25,
      randomInitialDirection: false,
      seed,
      use2dPitch:true,
      erosion:true,
      erosionLimit:0.2,
      erosionPerStep:0.01
    };

    const pvectorFieldGen2D = new VectorFieldGenerator(2, vf2dGridSize, vf2dGridSize);
    await pvectorFieldGen2D.generateFlowField(seed, noiseConfigs2, stepSize, true);
    await pvectorFieldGen2D.visualizeVectorField2D(container2, simParams2d);
  
    const pterrainGen2D = new VectorFieldGenerator(2, vf2dGridSize, vf2dGridSize);
    await pterrainGen2D.generateFlowField(seed, noiseConfigs2, stepSize, true);
    await pterrainGen2D.visualizeVectorField2D(container3, simParams2d, true);
  
    const noiseConfigs3 = [
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
    await vectorFieldGen3D.generateFlowField(seed, noiseConfigs3, stepSize, true);
    await vectorFieldGen3D.visualizeVectorField3D(container4);
  
    // Add particle visualization in 3D
    const pvectorFieldGen3D = new VectorFieldGenerator(3, 30, 30, 30);
    await pvectorFieldGen3D.generateFlowField(seed, noiseConfigs3, stepSize, true);
    await pvectorFieldGen3D.visualizeVectorField3D(container5, {
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
  
  
    return {vectorFieldGen2D, vectorFieldGen3D, pvectorFieldGen2D, pvectorFieldGen3D, pterrainGen2D, container: cc};
  }
  
  export const cleanupVFieldRender = async (scene) => {
      scene.vectorFieldGen2D.cleanup();
      scene.pvectorFieldGen2D.cleanup();
      scene.vectorFieldGen3D.cleanup();
      scene.pvectorFieldGen3D.cleanup();
      scene.pterrainGen2D.cleanup();
      scene.container.remove();
  }
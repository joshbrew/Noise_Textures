import * as BABYLON from 'babylonjs'
import { BaseNoise } from './noiseFunctions';

class VectorField {
    constructor(dimensions=2, sizeX, sizeY, sizeZ = 1) {
      if (dimensions !== 2 && dimensions !== 3) {
        throw new Error("Dimensions must be either 2 or 3.");
      }
  
      this.dimensions = dimensions;
      this.sizeX = sizeX;
      this.sizeY = sizeY;
      this.sizeZ = dimensions === 3 ? sizeZ : 1;
  
      const fieldSize = sizeX * sizeY * sizeZ * this.dimensions;
      this.field = new Float32Array(fieldSize);
    }
  
    _getIndex(x, y, z = 0) {
      return (x + this.sizeX * (y + this.sizeY * z)) * this.dimensions;
    }
  
    setVector(x, y, z, vector) {
      const index = this._getIndex(x, y, z);
      for (let i = 0; i < this.dimensions; i++) {
        this.field[index + i] = vector[i];
      }
    }
  
    getVector(x, y, z = 0) {
      const index = this._getIndex(x, y, z);
      return new Float32Array(this.field.buffer, index * 4, this.dimensions);
    }
  
    fill(vector) {
      const totalSize = this.sizeX * this.sizeY * this.sizeZ;
      for (let i = 0; i < totalSize; i++) {
        for (let j = 0; j < this.dimensions; j++) {
          this.field[i * this.dimensions + j] = vector[j];
        }
      }
    }
  
    forEach(callback) {
      for (let x = 0; x < this.sizeX; x++) {
        for (let y = 0; y < this.sizeY; y++) {
          for (let z = 0; z < this.sizeZ; z++) {
            const index = this._getIndex(x, y, z);
            const vector = new Float32Array(this.field.buffer, index * 4, this.dimensions);
            callback(vector, x, y, z);
          }
        }
      }
    }
  
    setVectors(vectors, startX = 0, startY = 0, startZ = 0) {
        const sizeX = this.sizeX;
        const sizeY = this.sizeY;
        const sizeZ = this.sizeZ;
        const dims = this.dimensions;

        if (vectors.length !== (sizeX - startX) * (sizeY - startY) * (sizeZ - startZ) * dims) {
            throw new Error("Invalid vector array length.");
        }

        let vectorIndex = 0;
        for (let z = startZ; z < sizeZ; z++) {
            for (let y = startY; y < sizeY; y++) {
                for (let x = startX; x < sizeX; x++) {
                    const index = this._getIndex(x, y, z);
                    for (let d = 0; d < dims; d++) {
                        this.field[index + d] = vectors[vectorIndex++];
                    }
                }
            }
        }
    }
  
    getVectors(idx0=0,idx1) {
      return this.field.slice(idx0,idx1*3);
    }
  }


  import noiseWorker from './noise.worker'

  class VectorFieldGenerator {
    constructor(dimensions, sizeX=1, sizeY=1, sizeZ = 1) {
      this.vectorField = new VectorField(dimensions, sizeX, sizeY, sizeZ);
      this.dimensions = dimensions;
      this.canvas2D = null;
      this.canvas3D = null;
      this.engine3D = null;
      this.particles = [];
      this.particleTrails = [];
      this.heightMap = new Float32Array(sizeX * sizeY * sizeZ);
    }

    getHeightmapIndex(x,y,z=0) {
      return x + y * this.vectorField.sizeX + z * this.vectorField.sizeX * this.vectorField.sizeY;
    }
  
    async generateFlowField(seed, noiseConfigs, stepSize, getGradient = true) {
      const sizeX = this.vectorField.sizeX;
      const sizeY = this.vectorField.sizeY;
      const sizeZ = this.vectorField.sizeZ;
  
      const xRange = { start: 0, end: sizeX - 1 };
      const yRange = { start: 0, end: sizeY - 1 };
      const zRange = this.dimensions === 3 ? { start: 0, end: sizeZ - 1 } : undefined;
  
      const numValues = sizeX * sizeY * sizeZ;
  
      await this.runNoiseWorker(seed, noiseConfigs, xRange, yRange, zRange, stepSize, getGradient)
        .then((result) => {
          const { noiseValues, gradientValues } = result;

          this.heightMap.set(noiseValues);

          if (gradientValues) {
              this.vectorField.setVectors(gradientValues);
          }
      });
    }
  
    runNoiseWorker = async (seed, noiseConfigs, xRange, yRange, zRange, stepSize, getGradient, maxThreads = navigator.hardwareConcurrency || 4) => {
        const sizeX = xRange.end - xRange.start + 1;
        const sizeY = yRange.end - yRange.start + 1;
        const sizeZ = zRange ? (zRange.end - zRange.start + 1) : 1;
        const numValues = sizeX * sizeY * sizeZ;
        const noiseValues = new Float32Array(numValues);
        const gradientValues = getGradient ? new Float32Array(zRange ? numValues * 3 : numValues * 2) : null;
    
        const chunkSize = Math.ceil(sizeY / maxThreads);
        const workers = [];
        const promises = [];
    
        for (let thread = 0; thread < maxThreads; thread++) {
            const startY = yRange.start + thread * chunkSize;
            const endY = Math.min(yRange.start + (thread + 1) * chunkSize, yRange.end + 1);
    
            if (startY >= yRange.end + 1) break;
    
            const worker = new Worker(noiseWorker);  // Replace with the actual path to your worker file
            workers.push(worker);
    
            promises.push(new Promise((resolve) => {
                worker.onmessage = function (e) {
                    const { noiseValues: threadNoiseValues, gradientValues: threadGradientValues } = e.data;
    
                    let index = 0;
                    for (let y = startY; y < endY; y++) {
                        if (zRange) {
                            // 3D case
                            for (let z = zRange.start; z <= zRange.end; z++) {
                                for (let x = xRange.start; x <= xRange.end; x++) {
                                    const globalIndex = ((z - zRange.start) * sizeY + (y - yRange.start)) * sizeX + (x - xRange.start);
                                    noiseValues[globalIndex] = threadNoiseValues[index];
                                    if (getGradient && gradientValues) {
                                        gradientValues[globalIndex * 3] = threadGradientValues[index * 3];
                                        gradientValues[globalIndex * 3 + 1] = threadGradientValues[index * 3 + 1];
                                        gradientValues[globalIndex * 3 + 2] = threadGradientValues[index * 3 + 2];
                                    }
                                    index++;
                                }
                            }
                        } else {
                            // 2D case
                            for (let x = xRange.start; x <= xRange.end; x++) {
                                const globalIndex = (y - yRange.start) * sizeX + (x - xRange.start);
                                noiseValues[globalIndex] = threadNoiseValues[index];
                                if (getGradient && gradientValues) {
                                    gradientValues[globalIndex * 2] = threadGradientValues[index * 2];
                                    gradientValues[globalIndex * 2 + 1] = threadGradientValues[index * 2 + 1];
                                }
                                index++;
                            }
                        }
                    }
    
                    worker.terminate(); // Cleanup
                    resolve(true);
                };
    
                worker.postMessage({ 
                    seed, 
                    noiseConfigs, 
                    xRange, 
                    yRange: { start: startY, end: endY - 1 }, 
                    zRange, 
                    stepSize, 
                    getGradient 
                });
            }));
        }
        await Promise.all(promises);
    
        return { noiseValues, gradientValues };
    };
        
    
    simulateParticles({
      windDirection = [1, 0],
      initialSpeedRange = [0.5, 1.5],
      maxVelocity = 0.5,
      maxSteps = 100,
      minVelocity = 0.1,
      randomTerminationProb = 0.01,
      startPositions = [[0, 0]],
      variance = 5,
      randomDistribution = true,
      randomInitialDirection = false,
      nParticles = 100,
      windMul = 0.2,
      vectorMul = 0.2,
      curlStrength = 0.1,
      seed
    }) {
      const noise = new BaseNoise(seed);
      this.particles = new Float32Array(nParticles * 4); // [x, y, vx, vy] for each particle
      this.particleTrails = Array.from({ length: nParticles }, () => []);
    
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const perpendicularVector = (vx, vy, result) => {
        result[0] = Math.sin(-vy);
        result[1] = Math.cos(vx);
      };
    
      const calculateAcceleration = (vectorField, x, y, result) => {
        const dx1 = vectorField.getVector(clamp(x + 1, 0, vectorField.sizeX - 1), y)[0];
        const dx2 = vectorField.getVector(clamp(x - 1, 0, vectorField.sizeX - 1), y)[0];
        const dy1 = vectorField.getVector(x, clamp(y + 1, 0, vectorField.sizeY - 1))[1];
        const dy2 = vectorField.getVector(x, clamp(y - 1, 0, vectorField.sizeY - 1))[1];
        result[0] = (dx1 - dx2) / 2;
        result[1] = (dy1 - dy2) / 2;
      };
    
      const particlesPerField = nParticles / startPositions.length;
      const particleXY = Math.floor(Math.sqrt(particlesPerField));
    
      let particleIndex = 0;
      for (let i = 0; i < startPositions.length; i++) {
        const [startX, startY] = startPositions[i];
        for (let j = 0; j < particlesPerField; j++) {
          const x = startX + (randomDistribution ? noise.seededRandom() * variance : variance * (j % particleXY) / particleXY);
          const y = startY + (randomDistribution ? noise.seededRandom() * variance : variance * (Math.floor(j / particleXY)) / particleXY);
          const speed = initialSpeedRange[0] + noise.seededRandom() * (initialSpeedRange[1] - initialSpeedRange[0]);
          const vx = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[0]) * speed;
          const vy = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[1]) * speed;
    
          this.particles[particleIndex * 4] = x;
          this.particles[particleIndex * 4 + 1] = y;
          this.particles[particleIndex * 4 + 2] = vx;
          this.particles[particleIndex * 4 + 3] = vy;
          this.particleTrails[particleIndex].push([x, y]);
          particleIndex++;
        }
      }
    
      const acceleration = new Float32Array(2);
      const curl = new Float32Array(2);
    
      for (let step = 0; step < maxSteps; step++) {
        for (let i = 0; i < nParticles; i++) {
          const idx = i * 4;
          let x = this.particles[idx];
          let y = this.particles[idx + 1];
          let vx = this.particles[idx + 2];
          let vy = this.particles[idx + 3];
    
          if (x < 0 || x >= this.vectorField.sizeX || y < 0 || y >= this.vectorField.sizeY) {
            continue; // Terminate if out of bounds
          }
    
          const clampedX = clamp(Math.floor(x), 0, this.vectorField.sizeX - 1);
          const clampedY = clamp(Math.floor(y), 0, this.vectorField.sizeY - 1);
          const vector = this.vectorField.getVector(clampedX, clampedY);
    
          const velocityMagnitude = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
          if (velocityMagnitude < minVelocity || (noise.seededRandom() < randomTerminationProb)) {
            continue;
          }
    
          calculateAcceleration(this.vectorField, clampedX, clampedY, acceleration);
          perpendicularVector(vx, vy, curl);
          if (i % 2 === 0) { // flip direction of curl
            curl[0] = -curl[0];
            curl[1] = -curl[1];
          }
    
          vx += curl[0] * curlStrength * noise.seededRandom();
          vy += curl[1] * curlStrength * noise.seededRandom();
    
          vx += windDirection[0] * windMul;
          vy += windDirection[1] * windMul;
    
          vx += (-vector[0] + acceleration[0]) * vectorMul;
          vy += (-vector[1] + acceleration[1]) * vectorMul;
    
          const currentSpeed = Math.sqrt(vx * vx + vy * vy);
          if (currentSpeed > maxVelocity) {
            vx = (vx / currentSpeed) * maxVelocity;
            vy = (vy / currentSpeed) * maxVelocity;
          }
    
          x += vx;
          y += vy;
    
          vx *= 0.95;
          vy *= 0.95;
    
          if (x < 0 || x >= this.vectorField.sizeX || y < 0 || y >= this.vectorField.sizeY) {
            continue; // Terminate if out of bounds
          }
    
          this.particles[idx] = x;
          this.particles[idx + 1] = y;
          this.particles[idx + 2] = vx;
          this.particles[idx + 3] = vy;
          this.particleTrails[i].push([x, y]);
        }
      }
    }

    
    simulateParticles3D({
      windDirection = [1, 0, 0],
      initialSpeedRange = [0.5, 1.5],
      maxVelocity = 0.5,
      maxSteps = 100,
      minVelocity = 0.1,
      randomTerminationProb = 0.01,
      startPositions = [[0, 0, 0]],
      variance = 5,
      randomDistribution = true,
      randomInitialDirection = false,
      nParticles = 100,
      windMul = 0.2,
      vectorMul = 0.2,
      curlStrength = 0.1,
      seed
    }) {
      const noise = new BaseNoise(seed);
      this.particles = new Float32Array(nParticles * 6); // [x, y, z, vx, vy, vz] for each particle
      this.particleTrails = Array.from({ length: nParticles }, () => []);
    
      const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
      const perpendicularVector = (vx, vy, vz, result) => {
        result[0] = Math.sin(-vz);
        result[1] = Math.cos(vx);
        result[2] = Math.sin(-vy);
      };
    
      const calculateAcceleration = (vectorField, x, y, z, result) => {
        const dx1 = vectorField.getVector(clamp(x + 1, 0, vectorField.sizeX - 1), y, z)[0];
        const dx2 = vectorField.getVector(clamp(x - 1, 0, vectorField.sizeX - 1), y, z)[0];
        const dy1 = vectorField.getVector(x, clamp(y + 1, 0, vectorField.sizeY - 1), z)[1];
        const dy2 = vectorField.getVector(x, clamp(y - 1, 0, vectorField.sizeY - 1), z)[1];
        const dz1 = vectorField.getVector(x, y, clamp(z + 1, 0, vectorField.sizeZ - 1))[2];
        const dz2 = vectorField.getVector(x, y, clamp(z - 1, 0, vectorField.sizeZ - 1))[2];
        result[0] = (dx1 - dx2) / 2;
        result[1] = (dy1 - dy2) / 2;
        result[2] = (dz1 - dz2) / 2;
      };
    
      const particlesPerField = nParticles / startPositions.length;
      const particleXYZ = Math.cbrt(particlesPerField);
    
      let particleIndex = 0;
      for (let i = 0; i < startPositions.length; i++) {
        const [startX, startY, startZ] = startPositions[i];
        for (let j = 0; j < particlesPerField; j++) {
          const x = startX + (randomDistribution ? noise.seededRandom() * variance : variance * (j % particleXYZ) / particleXYZ);
          const y = startY + (randomDistribution ? noise.seededRandom() * variance : variance * (Math.floor(j / particleXYZ) % particleXYZ) / particleXYZ);
          const z = startZ + (randomDistribution ? noise.seededRandom() * variance : variance * Math.floor(j / (particleXYZ * particleXYZ)) / particleXYZ);
          const speed = initialSpeedRange[0] + noise.seededRandom() * (initialSpeedRange[1] - initialSpeedRange[0]);
          const vx = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[0]) * speed;
          const vy = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[1]) * speed;
          const vz = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[2]) * speed;
    
          this.particles[particleIndex * 6] = x;
          this.particles[particleIndex * 6 + 1] = y;
          this.particles[particleIndex * 6 + 2] = z;
          this.particles[particleIndex * 6 + 3] = vx;
          this.particles[particleIndex * 6 + 4] = vy;
          this.particles[particleIndex * 6 + 5] = vz;
          this.particleTrails[particleIndex].push([x, y, z]);
          particleIndex++;
        }
      }
    
      const acceleration = new Float32Array(3);
      const curl = new Float32Array(3);
    
      for (let step = 0; step < maxSteps; step++) {
        for (let i = 0; i < nParticles; i++) {
          const idx = i * 6;
          let x = this.particles[idx];
          let y = this.particles[idx + 1];
          let z = this.particles[idx + 2];
          let vx = this.particles[idx + 3];
          let vy = this.particles[idx + 4];
          let vz = this.particles[idx + 5];
    
          if (x < 0 || x >= this.vectorField.sizeX || y < 0 || y >= this.vectorField.sizeY || z < 0 || z >= this.vectorField.sizeZ) {
            continue; // Terminate if out of bounds
          }
    
          const clampedX = clamp(Math.floor(x), 0, this.vectorField.sizeX - 1);
          const clampedY = clamp(Math.floor(y), 0, this.vectorField.sizeY - 1);
          const clampedZ = clamp(Math.floor(z), 0, this.vectorField.sizeZ - 1);
          const vector = this.vectorField.getVector(clampedX, clampedY, clampedZ);
    
          const velocityMagnitude = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1] + vector[2] * vector[2]);
          if (velocityMagnitude < minVelocity || (noise.seededRandom() < randomTerminationProb)) {
            continue;
          }
    
          calculateAcceleration(this.vectorField, clampedX, clampedY, clampedZ, acceleration);
          perpendicularVector(vx, vy, vz, curl);
          if (i % 2 === 0) { // flip direction of curl
            curl[0] = -curl[0];
            curl[1] = -curl[1];
            curl[2] = -curl[2];
          }
    
          vx += curl[0] * curlStrength * noise.seededRandom();
          vy += curl[1] * curlStrength * noise.seededRandom();
          vz += curl[2] * curlStrength * noise.seededRandom();
    
          vx += windDirection[0] * windMul;
          vy += windDirection[1] * windMul;
          vz += windDirection[2] * windMul;
    
          vx += (vector[0] + acceleration[0]) * vectorMul;
          vy += (vector[1] + acceleration[1]) * vectorMul;
          vz += (vector[2] + acceleration[2]) * vectorMul;
    
          const currentSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
          if (currentSpeed > maxVelocity) {
            vx = (vx / currentSpeed) * maxVelocity;
            vy = (vy / currentSpeed) * maxVelocity;
            vz = (vz / currentSpeed) * maxVelocity;
          }
    
          x += vx;
          y += vy;
          z += vz;
    
          vx *= 0.95;
          vy *= 0.95;
          vz *= 0.95;
    
          if (x < 0 || x >= this.vectorField.sizeX || y < 0 || y >= this.vectorField.sizeY || z < 0 || z >= this.vectorField.sizeZ) {
            continue; // Terminate if out of bounds
          }
    
          this.particles[idx] = x;
          this.particles[idx + 1] = y;
          this.particles[idx + 2] = z;
          this.particles[idx + 3] = vx;
          this.particles[idx + 4] = vy;
          this.particles[idx + 5] = vz;
          this.particleTrails[i].push([x, y, z]);
        }
      }
    }

     visualizeVectorField2D = async (parentElement, particleParams = undefined, texturedHeightmap=false, noiseConfigs, seed=10000+10000*Math.random(), stepSize=1, getGradient = true) => {
      this.cleanup();
      if(noiseConfigs) await this.generateFlowField(seed, noiseConfigs, stepSize, getGradient);

      this.canvas2D = document.createElement('canvas');
      this.canvas2D.width = 500;
      this.canvas2D.height = 500;
      this.canvas2D.style.backgroundColor = 'black';
      const ctx = this.canvas2D.getContext('2d');
      const width = this.canvas2D.width;
      const height = this.canvas2D.height;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'black';
      ctx.fillRect(0,0,this.canvas2D.width,this.canvas2D.height);

      ctx.strokeStyle = 'white';
      if (particleParams) {
        this.simulateParticles(particleParams);

        const scaleX = width / this.vectorField.sizeX;
        const scaleY = height / this.vectorField.sizeY;

        // Draw particle trails
        this.particleTrails.forEach(trail => {
          ctx.beginPath();
          trail.forEach((point, index) => {
            const [x, y] = [point[0] * scaleX, point[1] * scaleY];
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
        });
      } else {
        const scale = width / this.vectorField.sizeX;
        ctx.beginPath();
        this.vectorField.forEach((vector, x, y) => {
          const startX = x * scale;
          const startY = y * scale;
          const endX = startX + vector[0] * scale*0.8;
          const endY = startY + vector[1] * scale*0.8;

          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
        });
        ctx.stroke();
      }

      if (texturedHeightmap) {
          // Create Babylon.js scene
          const canvas3D = document.createElement('canvas');
          canvas3D.width = 500;
          canvas3D.height = 500;
          parentElement.appendChild(canvas3D);
          const engine = new BABYLON.WebGPUEngine(canvas3D, { antialias:true });
          await engine.initAsync();
          const scene = new BABYLON.Scene(engine);

          const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 2, 50, new BABYLON.Vector3(0, 0, 0), scene);
          camera.attachControl(canvas3D, true);

          const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

          // Preallocate arrays for the custom mesh
          const positions = new Float32Array(this.vectorField.sizeX * this.vectorField.sizeY * 3);
          const indices = new Uint32Array((this.vectorField.sizeX - 1) * (this.vectorField.sizeY - 1) * 6);
          const uvs = new Float32Array(this.vectorField.sizeX * this.vectorField.sizeY * 2);

          let positionIndex = 0;
          let uvIndex = 0;
          let indexIndex = 0;

          for (let y = 0; y < this.vectorField.sizeY; y++) {
              for (let x = 0; x < this.vectorField.sizeX; x++) {
                  const k = y * this.vectorField.sizeX + x;
                  const heightValue = this.heightMap[this.getHeightmapIndex(x, y, 0)];

                  // Fill positions
                  positions[positionIndex++] = x - this.vectorField.sizeX / 2;
                  positions[positionIndex++] = heightValue * 20;
                  positions[positionIndex++] = y - this.vectorField.sizeY / 2;

                  // Fill UVs
                  uvs[uvIndex++] =(x) / this.vectorField.sizeX;
                  uvs[uvIndex++] = (this.vectorField.sizeY - y) / this.vectorField.sizeY;

                  // Fill indices
                  if (x < this.vectorField.sizeX - 1 && y < this.vectorField.sizeY - 1) {
                      const topLeft = k;
                      const topRight = k + 1;
                      const bottomLeft = k + this.vectorField.sizeX;
                      const bottomRight = k + this.vectorField.sizeX + 1;
                      indices[indexIndex++] = topLeft;
                      indices[indexIndex++] = topRight;
                      indices[indexIndex++] = bottomLeft;
                      indices[indexIndex++] = topRight;
                      indices[indexIndex++] = bottomRight;
                      indices[indexIndex++] = bottomLeft;
                  }
              }
          }

          const customMesh = new BABYLON.Mesh("custom", scene);
          const vertexData = new BABYLON.VertexData();
          vertexData.positions = positions;
          vertexData.indices = indices;
          vertexData.uvs = uvs;
          vertexData.applyToMesh(customMesh);

          // Create a texture from the 2D canvas
          const texture = new BABYLON.DynamicTexture(
            "dynamicTexture", 
            {width:this.canvas2D.width,height:this.canvas2D.height}, 
            scene, 
            false
          );
          //console.log(texture);
          
          const ctx = texture.getContext();
          ctx.drawImage(this.canvas2D,0,0);
          
          var font = "bold 44px monospace";
          texture.drawText("", 75, 135, font, "green", null, true, true);

          const material = new BABYLON.StandardMaterial("material", scene);
          material.diffuseTexture = texture;
          material.diffuseColor = new BABYLON.Color3(0.5,0.5,0.5);
          material.specularColor = new BABYLON.Color3(0.015, 0.015, 0.015);
          customMesh.material = material;

          engine.runRenderLoop(() => {
              scene.render();
          });

          window.addEventListener('resize', () => {
              engine.resize();
          });
      } else parentElement.appendChild(this.canvas2D); //use the 2d canvas instead if not using the 3d render
    }
    
     visualizeVectorField3D = async (parentElement, particleParams = undefined, noiseConfigs, seed=10000+10000*Math.random(), stepSize=1, getGradient = true) => {
      this.cleanup();
      if(noiseConfigs) await this.generateFlowField(seed, noiseConfigs, stepSize, getGradient);

      this.canvas3D = document.createElement('canvas');
      this.canvas3D.width = 500;
      this.canvas3D.height = 500;
      this.canvas3D.style.backgroundColor = 'black';
      parentElement.appendChild(this.canvas3D);
      this.engine3D = new BABYLON.WebGPUEngine(this.canvas3D, { antialias: true });
      await this.engine3D.initAsync();
      const scene = new BABYLON.Scene(this.engine3D);
      scene.clearColor = BABYLON.Color3.Black();
      const camera = new BABYLON.ArcRotateCamera('camera', Math.PI / 2, Math.PI / 2, 50, new BABYLON.Vector3(0, 0, 0), scene);
      
      camera.attachControl(this.canvas3D, true);
      const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);

      if (particleParams) {
        this.simulateParticles3D(particleParams);

        const createParticleTrailMesh = (trail) => {
          const points = trail.map(p => new BABYLON.Vector3(...p));
          return BABYLON.MeshBuilder.CreateLines("trail", { points: points }, scene);
        };

        const trailMaterial = new BABYLON.StandardMaterial("trailMaterial", scene);
        trailMaterial.emissiveColor = new BABYLON.Color3(0.75, 0.75, 1);

        this.particleTrails.forEach(trail => {
          const trailMesh = createParticleTrailMesh(trail);
          trailMesh.material = trailMaterial;
          trailMesh.freezeWorldMatrix();
        });
      } else {
        const arrowMesh = BABYLON.MeshBuilder.CreateLines('arrow', {
          points: [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(1, 0, 0)]
        }, scene);
        arrowMesh.color = new BABYLON.Color3(0.75, 0.75, 1);

        const matricesData = [];

        this.vectorField.forEach((vector, x, y, z) => {
          const scale = 0.1; // Make arrows smaller
          const direction = new BABYLON.Vector3(vector[0], vector[1], vector[2]).normalize();
          const length = new BABYLON.Vector3(vector[0], vector[1], vector[2]).length() * scale;
          //const end = new BABYLON.Vector3(x, y, z).add(direction.scale(length));

          const matrix = BABYLON.Matrix.Compose(
            new BABYLON.Vector3(scale, scale, length),
            BABYLON.Quaternion.FromEulerVector(direction),
            new BABYLON.Vector3(x, y, z)
          );
          matricesData.push(matrix);
        });

        arrowMesh.thinInstanceAdd(matricesData);
      }

      this.engine3D.runRenderLoop(() => {
        scene.render();
      });

      this.engine3D.RESIZEEVENT = () => {
        this.engine3D.resize();
      }

      window.addEventListener('resize', this.engine3D.RESIZEEVENT);

      this.scene3D = scene;
    }


    cleanup() {
        if (this.canvas2D) {
            this.canvas2D.remove();
            this.canvas2D = null;
        }

        if (this.scene3D) {
          this.scene3D.dispose();
          this.scene3D = null;
        } 

        if (this.engine3D) {

            window.removeEventListener('resize', this.engine3D.RESIZEEVENT);

            this.engine3D.dispose();
            this.engine3D = null;
        }

        if (this.canvas3D) {
          this.canvas3D.remove();
          this.canvas3D = null;
        }

        this.particles = [];
        this.particleTrails = [];
    }

    
}
    
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

  
  const noiseConfigs = [
    {
      type: 'VoronoiTileNoise',
      zoom: 100.0,
      octaves: 3,
      lacunarity: 2.0,
      gain: 0.5,
      shift: 0,
      frequency: 1,
    },
  ];

  const stepSize = 1;
  const seed = 12345.67891;///Math.floor(Math.random() * 10000);

  const vectorFieldGen2D = new VectorFieldGenerator(2, 100, 100);
  await vectorFieldGen2D.generateFlowField(seed, noiseConfigs, stepSize, true);
  await vectorFieldGen2D.visualizeVectorField2D(container);

  const pvectorFieldGen2D = new VectorFieldGenerator(2, 100, 100);
  await pvectorFieldGen2D.generateFlowField(seed, noiseConfigs, stepSize, true);
  await pvectorFieldGen2D.visualizeVectorField2D(container2, {
    windDirection: [1, 1],
    initialSpeedRange: [0.1, 0.2],
    maxVelocity: 0.2,
    minVelocity: 0.01, //terminate path
    maxSteps: 200,
    randomTerminationProb: 0.01,
    startPositions: [[0, 0]],//, [0, 25], [25, 0], [5, 0], [0, 5], [0, 10], [10, 0], [15, 0], [0, 15]],
    variance: 100, //randomly seed over entire 50x50 grid from 0,0 position
    randomDistribution: true, //random or even distribution?
    nParticles: 3000,
    vectorMul: 2,
    windMul: 1,
    curlStrength: 0.0,
    randomInitialDirection: false,
    seed
  }, true);

  const vectorFieldGen3D = new VectorFieldGenerator(3, 30, 30, 30);
  await vectorFieldGen3D.generateFlowField(seed, noiseConfigs, stepSize, true);
  await vectorFieldGen3D.visualizeVectorField3D(container3);

  // Add particle visualization in 3D
  const pvectorFieldGen3D = new VectorFieldGenerator(3, 30, 30, 30);
  await pvectorFieldGen3D.generateFlowField(seed, noiseConfigs, stepSize, true);
  await pvectorFieldGen3D.visualizeVectorField3D(container4, {
    windDirection: [1, 1, 1],
    initialSpeedRange: [0.1, 0.2, 0.2],
    maxVelocity: 0.2,
    minVelocity: 0.01, //terminate path
    maxSteps: 100,
    randomTerminationProb: 0.01,
    startPositions: [[0, 0, 0]],
    variance: 30, //randomly seed over entire 20x20x20 grid from 0,0,0 position
    randomDistribution: true, //random or even distribution?
    nParticles: 1500,
    vectorMul: 0.5,
    windMul: 2,
    curlStrength: 0.25,
    randomInitialDirection: false,
    seed
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

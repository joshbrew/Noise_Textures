import * as BABYLON from 'babylonjs'
import { BaseNoise } from './noiseFunctions';

export class VectorField {
    constructor(dimensions=2, sizeX, sizeY=1, sizeZ = 1) {
      if (dimensions !== 2 && dimensions !== 3) {
        throw new Error("Dimensions must be either 2 or 3.");
      }
  
      this.dimensions = dimensions;
      this.sizeX = sizeX;
      this.sizeY = dimensions > 1 ? sizeY : 1;
      this.sizeZ = dimensions === 3 ? sizeZ : 1;
  
      const fieldSize = sizeX * sizeY * sizeZ * this.dimensions;
      this.field = new Float32Array(fieldSize);
    }
  
    _getIndex(x, y, z = 0) {
      if(this.dimensions === 3) return (x + this.sizeX * (y + this.sizeY * z)) * 3;
      else return (x + this.sizeX * y) * 2;
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

  export class VectorFieldGenerator {
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
        
    
    rotateVector2D(vecx, vecy, angle) {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
    
      return [
        vecx * cosA - vecy * sinA,
        vecx * sinA + vecy * cosA
      ];
    }

    varyDirection2D(dx, dy, maxDegrees, noise) {
      const maxRadians = maxDegrees * (Math.PI / 180); // Convert degrees to radians
      const angle = ((noise.seededRandom() || Math.random()) * 2 - 1) * maxRadians; // Random angle within the specified range
    
      return this.rotateVector2D(dx, dy, angle);
    }

    simulateParticles({
      nParticles = 100,
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
      windMul = 0.2,
      vectorMul = 0.2,
      curlStrength = 0.1, 
      clusteredVariance = false, //make particles drop in 
      clusters = nParticles/25,
      clusterAngle = 30, //vary the cluster starting angle
      seed = 10000+10000*Math.random() //deterministic results
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
      let clusterCt = 0;
      let clusterX, clusterY;
      let clusterVX, clusterVY;
      let clusterSize = 0; 
      if(clusteredVariance) clusterSize = particlesPerField / (clusters*startPositions.length);

      for (let i = 0; i < startPositions.length; i++) {
        const [startX, startY] = startPositions[i];
        for (let j = 0; j < particlesPerField; j++) {

          let x,y,vx,vy;
          const speed = initialSpeedRange[0] + noise.seededRandom() * (initialSpeedRange[1] - initialSpeedRange[0]);

          if(clusteredVariance) {
            if(clusterCt >= clusterSize) clusterCt = 0;
            if (clusterCt === 0) {
              if(!randomDistribution) {

                // Calculate the number of clusters per row and column
                const clustersPerRow = Math.ceil(Math.sqrt(clusters)); // Number of clusters per row
                const clustersPerCol = Math.ceil(clusters / clustersPerRow)*(clusterSize); // Number of clusters per column
            
                // Calculate the grid position for the current cluster
                const clusterRow = Math.floor(j / clustersPerRow);
                const clusterCol = j % (clustersPerRow);
            
                // Calculate cluster positions based on grid size
                clusterX = startX + (clusterCol * (variance / clustersPerRow) + (variance / clustersPerRow));
                clusterY = startY + (clusterRow * (variance / clustersPerCol) + (variance / clustersPerCol));
          
              } else {
                clusterX = startX + variance*noise.seededRandom();
                clusterY = startY + variance*noise.seededRandom();
              }
              const speed = initialSpeedRange[0] + noise.seededRandom() * (initialSpeedRange[1] - initialSpeedRange[0]);
              clusterVX = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[0]) * speed;
              clusterVY = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[1]) * speed;
            }

            x = clusterX; y = clusterY;
            [vx,vy] = this.varyDirection2D(clusterVX,clusterVY,clusterAngle,noise);
            clusterCt++;
          } else {
            x = startX + (randomDistribution ? noise.seededRandom() * variance : variance * (j % particleXY) / particleXY);
            y = startY + (randomDistribution ? noise.seededRandom() * variance : variance * (Math.floor(j / particleXY)) / particleXY);
            vx = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[0]) * speed;
            vy = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[1]) * speed;
          }
    
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


    rotateVector3D(vx,vy,vz, ux,uy,uz, angle) {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
    
      return [
        (cosA + (1 - cosA) * ux * ux) * vx + ((1 - cosA) * ux * uy - uz * sinA) * vy + ((1 - cosA) * ux * uz + uy * sinA) * vz,
        ((1 - cosA) * uy * ux + uz * sinA) * vx + (cosA + (1 - cosA) * uy * uy) * vy + ((1 - cosA) * uy * uz - ux * sinA) * vz,
        ((1 - cosA) * uz * ux - uy * sinA) * vx + ((1 - cosA) * uz * uy + ux * sinA) * vy + (cosA + (1 - cosA) * uz * uz) * vz
      ];
    }

    varyDirection3D(vx,vy,vz, maxDegrees, noise) {
      // Convert max degrees to radians
      const maxRadians = maxDegrees * (Math.PI / 180);
      // Generate a random angle within the specified range
      const angle = ((noise.seededRandom() || Math.random()) - 0.5) * 2 * maxRadians;
    
      // Generate a random axis
      let ux = (noise.seededRandom() || Math.random()); let uy = (noise.seededRandom() || Math.random()); let uz = (noise.seededRandom() || Math.random());
      const magnitude = Math.sqrt(ux ** 2 + uy ** 2 + uz ** 2);
    
      // Rotate the direction vector around the random axis by the random angle
      return this.rotateVector3D(vx,vy,vz,ux/magnitude,uy/magnitude,uz/magnitude, angle);
    }
    
    simulateParticles3D({
      nParticles = 100,
      seed = 10000+10000*Math.random(),
      windMul = 0.2,
      vectorMul = 0.2,
      curlStrength = 0.1,
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
      clusteredVariance = false, //make particles drop in clusters 
      clusters = nParticles/25, //if clustering the variance
      clusterAngle = 30, //vary the cluster starting angle
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
      let clusterCt = 0;
      let clusterX, clusterY, clusterZ;
      let clusterVX, clusterVY, clusterVZ;
      let clusterSize = 0; 
      if(clusteredVariance) clusterSize = particlesPerField / (clusters*startPositions.length);
      for (let i = 0; i < startPositions.length; i++) {
        const [startX, startY, startZ] = startPositions[i];
        
        for (let j = 0; j < particlesPerField; j++) {
          let x,y,z,vx,vy,vz;
          const speed = initialSpeedRange[0] + noise.seededRandom() * (initialSpeedRange[1] - initialSpeedRange[0]);

          if(clusteredVariance) {
            if(clusterCt > clusterSize) clusterCt = 0;
            if (clusterCt === 0) {
              if (!randomDistribution) {
                // Calculate the grid position for the current cluster
                const clustersPerSide = Math.cbrt(clusters);

                const clusterIndex = j/clusterSize;
                
                const clusterRow = Math.floor(clusterIndex / (clustersPerSide * clustersPerSide));
                const clusterCol = Math.floor((clusterIndex % (clustersPerSide * clustersPerSide)) / clustersPerSide);
                const clusterDepth = (clusterIndex % clustersPerSide);
                
                // Calculate cluster positions based on variance
                clusterX = startX + (clusterCol * variance/clustersPerSide);
                clusterY = startY + (clusterRow * variance/clustersPerSide);
                clusterZ = startZ + (clusterDepth * variance/clustersPerSide);
              } else {
                // Calculate cluster positions based on variance
                clusterX = startX + variance * noise.seededRandom();
                clusterY = startY + variance * noise.seededRandom();
                clusterZ = startZ + variance * noise.seededRandom();

              }
             
              const speed = initialSpeedRange[0] + noise.seededRandom() * (initialSpeedRange[1] - initialSpeedRange[0]);
              clusterVX = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[0]) * speed;
              clusterVY = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[1]) * speed;
              clusterVZ = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[2]) * speed;
            }

            x = clusterX; y = clusterY; z = clusterZ;
            [vx,vy,vz] = this.varyDirection3D(clusterVX,clusterVY,clusterVZ,clusterAngle,noise);

            clusterCt++;
          } else {
            x = startX + (randomDistribution ? noise.seededRandom() * variance : variance * (j % particleXYZ) / particleXYZ);
            y = startY + (randomDistribution ? noise.seededRandom() * variance : variance * (Math.floor(j / particleXYZ) % particleXYZ) / particleXYZ);
            z = startZ + (randomDistribution ? noise.seededRandom() * variance : variance * Math.floor(j / (particleXYZ * particleXYZ)) / particleXYZ);
            vx = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[0]) * speed;
            vy = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[1]) * speed;
            vz = (randomInitialDirection ? (2 * noise.seededRandom() - 1) : windDirection[2]) * speed;
          }


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
      this.canvas2D.width = 1000;
      this.canvas2D.height = 1000;
      
      this.canvas2D.style.backgroundColor = 'black';
      this.canvas2D.style.width='500px';
      this.canvas2D.style.height='500px';
      const ctx = this.canvas2D.getContext('2d');
      const width = this.canvas2D.width;
      const height = this.canvas2D.height;

      ctx.clearRect(0, 0, width, height);
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
          const colors = new Float32Array(this.vectorField.sizeX * this.vectorField.sizeY * 4); // RGBA colors

          const positions2 = new Float32Array(this.vectorField.sizeX * this.vectorField.sizeY * 3);
          const colors2 = new Float32Array(this.vectorField.sizeX * this.vectorField.sizeY * 4); // RGBA colors

          let positionIndex = 0;
          let uvIndex = 0;
          let indexIndex = 0;
          let colorIndex = 0;

          for (let y = 0; y < this.vectorField.sizeY; y++) {
              for (let x = 0; x < this.vectorField.sizeX; x++) {
                  const k = y * this.vectorField.sizeX + x;
                  const heightValue = this.heightMap[this.getHeightmapIndex(x, y, 0)];
                  const vector = this.vectorField.getVector(x, y, 0);

                  // Fill positions
                  positions[positionIndex++] = x - this.vectorField.sizeX / 2;
                  positions2[positionIndex-1] = positions[positionIndex-1];
                  positions[positionIndex++] = heightValue * 20;
                  positions2[positionIndex-1] = positions[positionIndex-1]+0.1;
                  positions[positionIndex++] = y - this.vectorField.sizeY / 2;
                  positions2[positionIndex-1] = positions[positionIndex-1];

                  // Fill UVs
                  uvs[uvIndex++] = (1 + x) / (this.vectorField.sizeX - 1);
                  uvs[uvIndex++] = (1 + this.vectorField.sizeY - y) / (this.vectorField.sizeY - 1);

                  // Calculate angle and assign color based on height and angle
                  const mag = Math.sqrt(vector[1]*vector[1]+vector[0]*vector[0]);
                  const normalizedHeightValue = Math.max(-1, Math.min(1, heightValue / mag));
                  const angle = mag ? Math.asin(normalizedHeightValue) : 0;
                  
                  let r,g,b,a;
                  let r2,g2,b2,a2;
                  if (heightValue > 0 && angle > Math.PI / 2.1) {
                    //high elevation and lower angle
                    
                    r=0; g=0.7; b=0; a=1;
                    
                    r2=0.7; g2=0.7; b2=1; a2=1;

                  } else if (heightValue > 0 && angle > Math.PI / 3) {
                    //high elevation higher angle
                    
                    r=1; g=0.8; b=0.4; a=1;
                    
                    r2=0.7; g2=0.7; b2=1; a2=1;

                  } else if (heightValue > 0 && angle < Math.PI / 6) {
                    //high elevation higher angle
                    
                    r=0.4; g=0.4; b=0.4; a=1;
                    
                    r2=0.8; g2=0.8; b2=1; a2=1;

                  } else if (heightValue > 0 && angle < Math.PI / 3) {
                    //high elevation higher angle
                    
                    r=0.6; g=0.6; b=0.6; a=1;
                    
                    r2=0.6; g2=0.6; b2=1; a2=1;

                  } else if (heightValue <= 0) {
                    //low elevation
                    
                    r=0.25; g=0.25; b=1; a=1; 
                    
                    r2=0.25; g2=0.25; b2=1; a2=1; 

                  } else {
                    // Default color
                    
                    r=1; g=1; b=1; a=1;
                    
                    r2=1; g2=1; b2=1; a2=1;

                  }

                  // Fill colors (RGBA)
                  colors2[colorIndex] = r2;
                  colors2[colorIndex+1] = g2;
                  colors2[colorIndex+2] = b2;
                  colors2[colorIndex+3] = a2;

                  colors[colorIndex++] = r;
                  colors[colorIndex++] = g;
                  colors[colorIndex++] = b;
                  colors[colorIndex++] = a;

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
          vertexData.colors = colors; // Apply the colors
          vertexData.applyToMesh(customMesh);

          const customMesh2 = new BABYLON.Mesh("custom2", scene);
          const vertexData2 = new BABYLON.VertexData();
          vertexData2.positions = positions2;
          vertexData2.indices = new Uint32Array(indices);
          vertexData2.uvs = new Float32Array(uvs);
          vertexData2.colors = colors2; // Apply the colors
          vertexData2.applyToMesh(customMesh2);

          // Create a texture from the 2D canvas
          const texture = new BABYLON.DynamicTexture(
            "dynamicTexture", 
            this.canvas2D, 
            scene, 
            false
          );
          //console.log(texture);

          //const ctx = texture.getContext();
          // ctx.strokeStyle = 'white';
          texture.update();

          // var font = "bold 44px monospace";
          // texture.drawText("", 75, 135, font, "green", null, true, true);
          
          const material = new BABYLON.StandardMaterial("material", scene);
          material.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
          customMesh.material = material;

          const material2 = new BABYLON.StandardMaterial("material2", scene);
          material2.opacityTexture = texture;
          material2.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
          customMesh2.material = material2;

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
    

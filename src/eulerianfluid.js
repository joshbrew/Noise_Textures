import fluidworker from './fluid.worker.js'

export class FluidSimulation {
    constructor(density, numX, numY, h, mode = 'smoke') {
      this.density = density;
      this.numX = numX + 2;
      this.numY = numY + 2;
      this.numCells = this.numX * this.numY;
      this.h = h;
      this.u = new Float32Array(this.numCells);
      this.v = new Float32Array(this.numCells);
      this.newU = new Float32Array(this.numCells);
      this.newV = new Float32Array(this.numCells);
      this.p = new Float32Array(this.numCells);
      this.s = new Float32Array(this.numCells);
      this.t = new Float32Array(this.numCells);
      this.newT = new Float32Array(this.numCells);
      this.m = new Float32Array(this.numCells);
      this.newM = new Float32Array(this.numCells);
      this.m.fill(1.0);
      this.t.fill(0.0);
      this.s.fill(1.0);
      this.numSwirls = 0;
      this.maxSwirls = 100;
      this.swirlGlobalTime = 0.0;
      this.swirlX = new Float32Array(this.maxSwirls);
      this.swirlY = new Float32Array(this.maxSwirls);
      this.swirlOmega = new Float32Array(this.maxSwirls);
      this.swirlRadius = new Float32Array(this.maxSwirls);
      this.swirlTime = new Float32Array(this.maxSwirls);
      this.swirlTime.fill(0.0);
      this.mode = mode;
      //this.temperatureThreshold; //could swap fire to smoke at a threshold
      this.workers = [];
      this.numWorkers = navigator.hardwareConcurrency || 4;
      this.initWorkers();
    }
  
    initWorkers() {
      for (let i = 0; i < this.numWorkers; i++) {
        const worker = new Worker(fluidworker);
        worker.onmessage = (e) => this.handleWorkerMessage(e);
        this.workers.push(worker);
      }
    }
  
    handleWorkerMessage(event) {
      const { type, data } = event.data;
      switch (type) {
        case 'advectVel':
          this.handleAdvectVelResponse(data);
          break;
        case 'solveIncompressibility':
          this.handleSolveIncompressibilityResponse(data);
          break;
        case 'advectTemperature':
          this.handleAdvectTemperatureResponse(data);
          break;
        // Handle other cases similarly
      }
    }
  
    handleAdvectVelResponse(data) {
      const { newU, newV } = data;
      this.newU.set(newU);
      this.newV.set(newV);
      this.u.set(this.newU);
      this.v.set(this.newV);
    }
  
    handleSolveIncompressibilityResponse(data) {
      const { p, u, v } = data;
      this.p.set(p);
      this.u.set(u);
      this.v.set(v);
    }
  
    handleAdvectTemperatureResponse(data) {
      const { newT } = data;
      this.newT.set(newT);
      this.t.set(this.newT);
    }
  
    integrate(dt, gravity) {
      const n = this.numY;
      for (let i = 1; i < this.numX; i++) {
        for (let j = 1; j < this.numY - 1; j++) {
          if (this.s[i * n + j] !== 0.0 && this.s[i * n + j - 1] !== 0.0)
            this.v[i * n + j] += gravity * dt;
        }
      }
    }
  
    solveIncompressibility(numIters, dt, overRelaxation=1.9) {
      const chunkSize = Math.ceil(this.numX / this.numWorkers);
      for (let w = 0; w < this.numWorkers; w++) {
        const startX = w * chunkSize;
        const endX = Math.min((w + 1) * chunkSize, this.numX);
        this.workers[w].postMessage({
          type: 'solveIncompressibility',
          data: {
            startX,
            endX,
            numIters,
            dt,
            density: this.density,
            h: this.h,
            numY: this.numY,
            u: this.u,
            v: this.v,
            p: this.p,
            s: this.s,
            overRelaxation
          }
        });
      }
    }
  
    advectVel(dt) {
      const chunkSize = Math.ceil(this.numX / this.numWorkers);
      for (let w = 0; w < this.numWorkers; w++) {
        const startX = w * chunkSize;
        const endX = Math.min((w + 1) * chunkSize, this.numX);
        this.workers[w].postMessage({
          type: 'advectVel',
          data: {
            startX,
            endX,
            dt,
            numY: this.numY,
            h: this.h,
            u: this.u,
            v: this.v,
            s: this.s
          }
        });
      }
    }
  
    advectTemperature(dt) {
      const chunkSize = Math.ceil(this.numX / this.numWorkers);
      for (let w = 0; w < this.numWorkers; w++) {
        const startX = w * chunkSize;
        const endX = Math.min((w + 1) * chunkSize, this.numX);
        this.workers[w].postMessage({
          type: 'advectTemperature',
          data: {
            startX,
            endX,
            dt,
            numY: this.numY,
            h: this.h,
            u: this.u,
            v: this.v,
            t: this.t,
            s: this.s
          }
        });
      }
    }
  
    advectDensity(dt) {
      const chunkSize = Math.ceil(this.numX / this.numWorkers);
      for (let w = 0; w < this.numWorkers; w++) {
        const startX = w * chunkSize;
        const endX = Math.min((w + 1) * chunkSize, this.numX);
        this.workers[w].postMessage({
          type: 'advectDensity',
          data: {
            startX,
            endX,
            dt,
            numY: this.numY,
            h: this.h,
            u: this.u,
            v: this.v,
            t: this.t,
            s: this.s,
            density: this.m
          }
        });
      }
    }
  
    simulate(dt, gravity, numIters, overRelaxation) {
      this.integrate(dt, gravity);
      this.p.fill(0.0);
      this.solveIncompressibility(numIters, dt, overRelaxation);
      this.extrapolate();
      this.advectVel(dt);
      this.advectTemperature(dt);
      this.advectDensity(dt);
      if (this.mode === 'fire') {
        this.updateFire(dt);
      } else {
        this.advectSmoke(dt);
      }
    }
  
    extrapolate() {
      const n = this.numY;
      for (let i = 0; i < this.numX; i++) {
        this.u[i * n + 0] = this.u[i * n + 1];
        this.u[i * n + this.numY - 1] = this.u[i * n + this.numY - 2];
      }
      for (let j = 0; j < this.numY; j++) {
        this.v[0 * n + j] = this.v[1 * n + j];
        this.v[(this.numX - 1) * n + j] = this.v[(this.numX - 2) * n + j];
      }
    }
  
    advectSmoke(dt) {
      this.newM.set(this.m);
      const n = this.numY;
      const h = this.h;
      const h2 = 0.5 * h;
      for (let i = 1; i < this.numX - 1; i++) {
        for (let j = 1; j < this.numY - 1; j++) {
          if (this.s[i * n + j] !== 0.0) {
            const u = (this.u[i * n + j] + this.u[(i + 1) * n + j]) * 0.5;
            const v = (this.v[i * n + j] + this.v[i * n + j + 1]) * 0.5;
            const x = i * h + h2 - dt * u;
            const y = j * h + h2 - dt * v;
            this.newM[i * n + j] = this.sampleField(x, y, 'S_FIELD');
          }
        }
      }
      this.m.set(this.newM);
    }
  
    updateFire(dt) {
      const h = this.h;
      const swirlTimeSpan = 1.0;
      const swirlOmega = 20.0;
      const swirlDamping = 10.0 * dt;
      const swirlProbability = scene.swirlProbability * h * h;
      const fireCooling = 1.2 * dt;
      const smokeCooling = 0.3 * dt;
      const lift = 3.0;
      const acceleration = 6.0 * dt;
      const kernelRadius = scene.swirlMaxRadius;
      const n = this.numY;
      const maxX = (this.numX - 1) * this.h;
      const maxY = (this.numY - 1) * this.h;
  
      let num = 0;
      for (let nr = 0; nr < this.numSwirls; nr++) {
        this.swirlTime[nr] -= dt;
        if (this.swirlTime[nr] > 0.0) {
          this.swirlTime[num] = this.swirlTime[nr];
          this.swirlX[num] = this.swirlX[nr];
          this.swirlY[num] = this.swirlY[nr];
          this.swirlOmega[num] = this.swirlOmega[nr];
          num++;
        }
      }
      this.numSwirls = num;
  
      for (let nr = 0; nr < this.numSwirls; nr++) {
        const ageScale = this.swirlTime[nr] / swirlTimeSpan;
        let x = this.swirlX[nr];
        let y = this.swirlY[nr];
        const swirlU = (1.0 - swirlDamping) * this.sampleField(x, y, 'U_FIELD');
        const swirlV = (1.0 - swirlDamping) * this.sampleField(x, y, 'V_FIELD');
        x += swirlU * dt;
        y += swirlV * dt;
        x = Math.min(Math.max(x, h), maxX);
        y = Math.min(Math.max(y, h), maxY);
        this.swirlX[nr] = x;
        this.swirlY[nr] = y;
        const omega = this.swirlOmega[nr];
        const x0 = Math.max(Math.floor((x - kernelRadius) / h), 0);
        const y0 = Math.max(Math.floor((y - kernelRadius) / h), 0);
        const x1 = Math.min(Math.floor((x + kernelRadius) / h) + 1, this.numX - 1);
        const y1 = Math.min(Math.floor((y + kernelRadius) / h) + 1, this.numY - 1);
  
        for (let i = x0; i <= x1; i++) {
          for (let j = y0; j <= y1; j++) {
            for (let dim = 0; dim < 2; dim++) {
              const vx = dim === 0 ? i * h : (i + 0.5) * h;
              const vy = dim === 0 ? (j + 0.5) * h : j * h;
              const rx = vx - x;
              const ry = vy - y;
              const r = Math.sqrt(rx * rx + ry * ry);
              if (r < kernelRadius) {
                let s = 1.0;
                if (r > 0.8 * kernelRadius) {
                  s = 5.0 - 5.0 / kernelRadius * r;
                }
                if (dim === 0) {
                  const target = ry * omega + swirlU;
                  const u = this.u[n * i + j];
                  this.u[n * i + j] = (target - u) * s;
                } else {
                  const target = -rx * omega + swirlV;
                  const v = this.v[n * i + j];
                  this.v[n * i + j] += (target - v) * s;
                }
              }
            }
          }
        }
      }
  
      for (let i = 0; i < this.numX; i++) {
        for (let j = 0; j < this.numY; j++) {
          let t = this.t[i * n + j];
          const cooling = t < 0.3 ? smokeCooling : fireCooling;
          this.t[i * n + j] = Math.max(t - cooling, 0.0);
          const u = this.u[i * n + j];
          const v = this.v[i * n + j];
          const targetV = t * lift;
          this.v[i * n + j] += (targetV - v) * acceleration;
          let numNewSwirls = 0;
  
          if (scene.burningObstacle) {
            const dx = (i + 0.5) * this.h - scene.obstacleX;
            const dy = (j + 0.5) * this.h - scene.obstacleY - 3.0 * this.h;
            const d = dx * dx + dy * dy;
            if (scene.obstacleRadius * scene.obstacleRadius <= d && d < (scene.obstacleRadius + h) * (scene.obstacleRadius + h)) {
              this.t[i * n + j] = 1.0;
              if (Math.random() < 0.5 * swirlProbability)
                numNewSwirls++;
            }
          }
  
          if (j < 4 && scene.burningFloor) {
            this.t[i * n + j] = 1.0;
            this.u[i * n + j] = 0.0;
            this.v[i * n + j] = 0.0;
            if (Math.random() < swirlProbability)
              numNewSwirls++;
          }
  
          for (let k = 0; k < numNewSwirls; k++) {
            if (this.numSwirls >= this.maxSwirls)
              break;
            const nr = this.numSwirls;
            this.swirlX[nr] = i * h;
            this.swirlY[nr] = j * h;
            this.swirlOmega[nr] = (-1.0 + 2.0 * Math.random()) * swirlOmega;
            this.swirlTime[nr] = swirlTimeSpan;
            this.numSwirls++;
          }
        }
      }
  
      for (let i = 1; i < this.numX - 1; i++) {
        for (let j = 1; j < this.numY - 1; j++) {
          const t = this.t[i * n + j];
          if (t === 1.0) {
            const avg = (
              this.t[(i - 1) * n + (j - 1)] +
              this.t[(i + 1) * n + (j - 1)] +
              this.t[(i + 1) * n + (j + 1)] +
              this.t[(i - 1) * n + (j + 1)]
            ) * 0.25;
            this.t[i * n + j] = avg;
          }
        }
      }
    }
  
    sampleField(x, y, field) {
      const n = this.numY;
      const h = this.h;
      const h1 = 1.0 / h;
      const h2 = 0.5 * h;
      x = Math.max(Math.min(x, this.numX * h), h);
      y = Math.max(Math.min(y, this.numY * h), h);
      let dx = 0.0;
      let dy = 0.0;
      let f;
      switch (field) {
        case 'U_FIELD':
          f = this.u;
          dy = h2;
          break;
        case 'V_FIELD':
          f = this.v;
          dx = h2;
          break;
        case 'T_FIELD':
        case 'S_FIELD':
          f = this.m;
          dx = h2;
          dy = h2;
          break;
      }
      const x0 = Math.min(Math.floor((x - dx) * h1), this.numX - 1);
      const tx = ((x - dx) - x0 * h) * h1;
      const x1 = Math.min(x0 + 1, this.numX - 1);
      const y0 = Math.min(Math.floor((y - dy) * h1), this.numY - 1);
      const ty = ((y - dy) - y0 * h) * h1;
      const y1 = Math.min(y0 + 1, this.numY - 1);
      const sx = 1.0 - tx;
      const sy = 1.0 - ty;
      const val = sx * sy * f[x0 * n + y0] +
        tx * sy * f[x1 * n + y0] +
        tx * ty * f[x1 * n + y1] +
        sx * ty * f[x0 * n + y1];
      return val;
    }
  }
  

if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {

    self.onmessage = function(e) {
        const { type, data } = e.data;
        switch (type) {
          case 'advectVel':
            advectVel(data);
            break;
          case 'solveIncompressibility':
            solveIncompressibility(data);
            break;
          case 'advectTemperature':
            advectTemperature(data);
            break;
          case 'advectDensity':
            advectDensity(data);
            break;
        }
    };
      
    function advectVel(data) {
        const { startX, endX, dt, numY, h, u, v, s } = data;
        const newU = new Float32Array(u.length);
        const newV = new Float32Array(v.length);
        const h2 = 0.5 * h;
        for (let i = startX; i < endX; i++) {
          for (let j = 1; j < numY; j++) {
            if (s[i * numY + j] !== 0.0 && s[(i - 1) * numY + j] !== 0.0 && j < numY - 1) {
              let x = i * h;
              let y = j * h + h2;
              let uVal = u[i * numY + j];
              let vVal = avgV(i, j, v, numY);
              x = x - dt * uVal;
              y = y - dt * vVal;
              uVal = sampleField(x, y, 'U_FIELD', h, numY, u);
              newU[i * numY + j] = uVal;
            }
            if (s[i * numY + j] !== 0.0 && s[i * numY + j - 1] !== 0.0 && i < endX - 1) {
              let x = i * h + h2;
              let y = j * h;
              let uVal = avgU(i, j, u, numY);
              let vVal = v[i * numY + j];
              x = x - dt * uVal;
              y = y - dt * vVal;
              vVal = sampleField(x, y, 'V_FIELD', h, numY, v);
              newV[i * numY + j] = vVal;
            }
          }
        }
        postMessage({ type: 'advectVel', data: { newU, newV } });
    }
      
    function solveIncompressibility(data) {
        const { startX, endX, numIters, dt, density, h, numY, u, v, p, s } = data;
        const cp = density * h / dt;
        for (let iter = 0; iter < numIters; iter++) {
          for (let i = startX; i < endX - 1; i++) {
            for (let j = 1; j < numY - 1; j++) {
              if (s[i * numY + j] === 0.0)
                continue;
              const sx0 = s[(i - 1) * numY + j];
              const sx1 = s[(i + 1) * numY + j];
              const sy0 = s[i * numY + j - 1];
              const sy1 = s[i * numY + j + 1];
              const sVal = sx0 + sx1 + sy0 + sy1;
              if (sVal === 0.0)
                continue;
              const div = u[(i + 1) * numY + j] - u[i * numY + j] +
                v[i * numY + j + 1] - v[i * numY + j];
              let pVal = -div / sVal;
              pVal *= data.overRelaxation;
              p[i * numY + j] += cp * pVal;
              u[i * numY + j] -= sx0 * pVal;
              u[(i + 1) * numY + j] += sx1 * pVal;
              v[i * numY + j] -= sy0 * pVal;
              v[i * numY + j + 1] += sy1 * pVal;
            }
          }
        }
        postMessage({ type: 'solveIncompressibility', data: { p, u, v } });
    }
      
    function advectTemperature(data) {
        const { startX, endX, dt, numY, h, u, v, t, s } = data;
        const newT = new Float32Array(t.length);
        const h2 = 0.5 * h;
        for (let i = startX; i < endX; i++) {
          for (let j = 1; j < numY - 1; j++) {
            if (s[i * numY + j] !== 0.0) {
              const uVal = (u[i * numY + j] + u[(i + 1) * numY + j]) * 0.5;
              const vVal = (v[i * numY + j] + v[i * numY + j + 1]) * 0.5;
              const x = i * h + h2 - dt * uVal;
              const y = j * h + h2 - dt * vVal;
              newT[i * numY + j] = sampleField(x, y, 'T_FIELD', h, numY, t);
            }
          }
        }
        postMessage({ type: 'advectTemperature', data: { newT } });
    }
      
    function advectDensity(data) {
        const { startX, endX, dt, numY, h, u, v, t, s, density } = data;
        const newDensity = new Float32Array(density.length);
        const h2 = 0.5 * h;
        for (let i = startX; i < endX; i++) {
          for (let j = 1; j < numY - 1; j++) {
            if (s[i * numY + j] !== 0.0) {
              const uVal = (u[i * numY + j] + u[(i + 1) * numY + j]) * 0.5;
              const vVal = (v[i * numY + j] + v[i * numY + j + 1]) * 0.5;
              const x = i * h + h2 - dt * uVal;
              const y = j * h + h2 - dt * vVal;
              newDensity[i * numY + j] = sampleField(x, y, 'DENSITY_FIELD', h, numY, density);
            }
          }
        }
        postMessage({ type: 'advectDensity', data: { newDensity } });
    }
      
    function avgU(i, j, u, numY) {
        return (u[i * numY + j - 1] + u[i * numY + j] +
            u[(i + 1) * numY + j - 1] + u[(i + 1) * numY + j]) * 0.25;
    }
    
    function avgV(i, j, v, numY) {
        return (v[(i - 1) * numY + j] + v[i * numY + j] +
            v[(i - 1) * numY + j + 1] + v[i * numY + j + 1]) * 0.25;
    }
    
    function sampleField(x, y, field, h, numY, f) {
        const h1 = 1.0 / h;
        const h2 = 0.5 * h;
        x = Math.max(Math.min(x, f.length * h), h);
        y = Math.max(Math.min(y, numY * h), h);
        let dx = 0.0;
        let dy = 0.0;
        switch (field) {
            case 'U_FIELD':
            dy = h2;
            break;
            case 'V_FIELD':
            dx = h2;
            break;
            case 'T_FIELD':
            case 'DENSITY_FIELD':
            dx = h2;
            dy = h2;
            break;
        }
        const x0 = Math.min(Math.floor((x - dx) * h1), f.length - 1);
        const tx = ((x - dx) - x0 * h) * h1;
        const x1 = Math.min(x0 + 1, f.length - 1);
        const y0 = Math.min(Math.floor((y - dy) * h1), numY - 1);
        const ty = ((y - dy) - y0 * h) * h1;
        const y1 = Math.min(y0 + 1, numY - 1);
        const sx = 1.0 - tx;
        const sy = 1.0 - ty;
        const val = sx * sy * f[x0 * numY + y0] +
            tx * sy * f[x1 * numY + y0] +
            tx * ty * f[x1 * numY + y1] +
            sx * ty * f[x0 * numY + y1];
        return val;
    }
      


}
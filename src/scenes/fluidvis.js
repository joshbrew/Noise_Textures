// Import the FluidSimulation class
import {FluidSimulation} from '../eulerianfluid.js';

export const createSim = async () => {
    document.body.insertAdjacentHTML('beforeend',`
<div id="fluidsim">
    <canvas id="myCanvas"></canvas>
    <div>
        <button id="startButton" onclick="toggleStart()">Start</button>
        <label for="streamButton">Show Streamlines</label>
        <input type="checkbox" id="streamButton">
        <label for="velocityButton">Show Velocities</label>
        <input type="checkbox" id="velocityButton">
        <label for="pressureButton">Show Pressure</label>
        <input type="checkbox" id="pressureButton">
        <label for="smokeButton">Show Smoke</label>
        <input type="checkbox" id="smokeButton">
    </div>
</div>
`)


const canvas = document.getElementById("myCanvas");
const c = canvas.getContext("2d", {willReadFrequently:true});

var scene = {
  gravity: -9.81,
  dt: 1.0 / 120.0,
  numIters: 100,
  frameNr: 0,
  overRelaxation: 1.9,
  obstacleX: 0.0,
  obstacleY: 0.0,
  obstacleRadius: 0.15,
  paused: false,
  sceneNr: 0,
  showObstacle: false,
  showStreamlines: false,
  showVelocities: false,
  showPressure: false,
  showSmoke: true,
  fluid: null,
  mode: 'smoke' // Default to smoke simulation
};

function setupScene(sceneNr = 0) {
  scene.sceneNr = sceneNr;
  scene.obstacleRadius = 0.15;
  scene.overRelaxation = 1.9;

  scene.dt = 1.0 / 60.0;
  scene.numIters = 40;

  var res = 100;

  if (sceneNr === 0) res = 50;
  else if (sceneNr === 3) res = 200;

  let simHeight = 1.0;	
  cScale = canvas.height / simHeight;
  let simWidth = canvas.width / cScale;

  var domainHeight = 1.0;
  var domainWidth = domainHeight / simHeight * simWidth;
  var h = domainHeight / res;

  var numX = Math.floor(domainWidth / h);
  var numY = Math.floor(domainHeight / h);

  var density = 1000.0;

  f = scene.fluid = new FluidSimulation(density, numX, numY, h, scene.mode);

  var n = f.numY;

  if (sceneNr === 0) {
    for (var i = 0; i < f.numX; i++) {
      for (var j = 0; j < f.numY; j++) {
        var s = 1.0; // fluid
        if (i === 0 || i === f.numX - 1 || j === 0) s = 0.0; // solid
        f.s[i * n + j] = s;
      }
    }
    scene.gravity = -9.81;
    scene.showPressure = true;
    scene.showSmoke = false;
    scene.showStreamlines = false;
    scene.showVelocities = false;
  } else if (sceneNr === 1 || sceneNr === 3) {
    var inVel = 2.0;
    for (var i = 0; i < f.numX; i++) {
      for (var j = 0; j < f.numY; j++) {
        var s = 1.0; // fluid
        if (i === 0 || j === 0 || j === f.numY - 1) s = 0.0; // solid
        f.s[i * n + j] = s;

        if (i === 1) {
          f.u[i * n + j] = inVel;
        }
      }
    }

    var pipeH = 0.1 * f.numY;
    var minJ = Math.floor(0.5 * f.numY - 0.5 * pipeH);
    var maxJ = Math.floor(0.5 * f.numY + 0.5 * pipeH);

    for (var j = minJ; j < maxJ; j++) f.m[j] = 0.0;

    setObstacle(0.4, 0.5, true);

    scene.gravity = 0.0;
    scene.showPressure = false;
    scene.showSmoke = true;
    scene.showStreamlines = false;
    scene.showVelocities = false;

    if (sceneNr === 3) {
      scene.dt = 1.0 / 120.0;
      scene.numIters = 100;
      scene.showPressure = true;
    }
  } else if (sceneNr === 2) {
    scene.gravity = 0.0;
    scene.overRelaxation = 1.0;
    scene.showPressure = false;
    scene.showSmoke = true;
    scene.showStreamlines = false;
    scene.showVelocities = false;
    scene.obstacleRadius = 0.1;
  }

  document.getElementById("streamButton").checked = scene.showStreamlines;
  document.getElementById("velocityButton").checked = scene.showVelocities;
  document.getElementById("pressureButton").checked = scene.showPressure;
  document.getElementById("smokeButton").checked = scene.showSmoke;
}

function setColor(r, g, b) {
  c.fillStyle = `rgb(${Math.floor(255 * r)},${Math.floor(255 * g)},${Math.floor(255 * b)})`;
  c.strokeStyle = `rgb(${Math.floor(255 * r)},${Math.floor(255 * g)},${Math.floor(255 * b)})`;
}

function getSciColor(val, minVal, maxVal) {
  val = Math.min(Math.max(val, minVal), maxVal - 0.0001);
  var d = maxVal - minVal;
  val = d === 0.0 ? 0.5 : (val - minVal) / d;
  var m = 0.25;
  var num = Math.floor(val / m);
  var s = (val - num * m) / m;
  var r, g, b;

  switch (num) {
    case 0:
      r = 0.0;
      g = s;
      b = 1.0;
      break;
    case 1:
      r = 0.0;
      g = 1.0;
      b = 1.0 - s;
      break;
    case 2:
      r = s;
      g = 1.0;
      b = 0.0;
      break;
    case 3:
      r = 1.0;
      g = 1.0 - s;
      b = 0.0;
      break;
  }

  return [255 * r, 255 * g, 255 * b, 255];
}

function getFireColor(val) {
  val = Math.min(Math.max(val, 0.0), 1.0);
  var r, g, b;

  if (val < 0.3) {
    let s = val / 0.3;
    r = 0.2 * s;
    g = 0.2 * s;
    b = 0.2 * s;
  } else if (val < 0.5) {
    let s = (val - 0.3) / 0.2;
    r = 0.2 + 0.8 * s;
    g = 0.1;
    b = 0.1;
  } else {
    let s = (val - 0.5) / 0.48;
    r = 1.0;
    g = s;
    b = 0.0;
  }
  return [255 * r, 255 * g, 255 * b, 255];
}

function cX(x) {
    return x * cScale;
}

function cY(y) {
    return canvas.height - y * cScale;
}


function draw() {
  c.clearRect(0, 0, canvas.width, canvas.height);

  f = scene.fluid;
  n = f.numY;

  var cellScale = 1.1;
  var h = f.h;

  id = c.getImageData(0, 0, canvas.width, canvas.height);

  var color = [255, 255, 255, 255];

  for (var i = 0; i < f.numX; i++) {
    for (var j = 0; j < f.numY; j++) {
      if (scene.mode === 'fire') {
        var t = f.t[i * n + j];
        color = getFireColor(t);
      } else {
        if (scene.showPressure) {
          var p = f.p[i * n + j];
          var s = f.m[i * n + j];
          color = getSciColor(p, minP, maxP);
          if (scene.showSmoke) {
            color[0] = Math.max(0.0, color[0] - 255 * s);
            color[1] = Math.max(0.0, color[1] - 255 * s);
            color[2] = Math.max(0.0, color[2] - 255 * s);
          }
        } else if (scene.showSmoke) {
          var s = f.m[i * n + j];
          color[0] = 255 * s;
          color[1] = 255 * s;
          color[2] = 255 * s;
          if (scene.sceneNr === 2) color = getSciColor(s, 0.0, 1.0);
        } else if (f.s[i * n + j] === 0.0) {
          color[0] = 0;
          color[1] = 0;
          color[2] = 0;
        }
      }

      var x = Math.floor(cX(i * h));
      var y = Math.floor(cY((j + 1) * h));
      var cx = Math.floor(cScale * cellScale * h) + 1;
      var cy = Math.floor(cScale * cellScale * h) + 1;

      var r = color[0];
      var g = color[1];
      var b = color[2];

      for (var yi = y; yi < y + cy; yi++) {
        var p = 4 * (yi * canvas.width + x);

        for (var xi = 0; xi < cx; xi++) {
          id.data[p++] = r;
          id.data[p++] = g;
          id.data[p++] = b;
          id.data[p++] = 255;
        }
      }
    }
  }

  c.putImageData(id, 0, 0);

  if (scene.showVelocities) {
    c.strokeStyle = "#000000";
    scale = 0.02;

    for (var i = 0; i < f.numX; i++) {
      for (var j = 0; j < f.numY; j++) {
        var u = f.u[i * n + j];
        var v = f.v[i * n + j];

        c.beginPath();

        var x0 = cX(i * h);
        var x1 = cX(i * h + u * scale);
        var y = cY((j + 0.5) * h);

        c.moveTo(x0, y);
        c.lineTo(x1, y);
        c.stroke();

        var x = cX((i + 0.5) * h);
        var y0 = cY(j * h);
        var y1 = cY(j * h + v * scale);

        c.beginPath();
        c.moveTo(x, y0);
        c.lineTo(x, y1);
        c.stroke();
      }
    }
  }

  if (scene.showStreamlines) {
    var segLen = f.h * 0.2;
    var numSegs = 15;

    c.strokeStyle = "#000000";

    for (var i = 1; i < f.numX - 1; i += 5) {
      for (var j = 1; j < f.numY - 1; j += 5) {
        var x = (i + 0.5) * f.h;
        var y = (j + 0.5) * f.h;

        c.beginPath();
        c.moveTo(cX(x), cY(y));

        for (var n = 0; n < numSegs; n++) {
          var u = f.sampleField(x, y, 'U_FIELD');
          var v = f.sampleField(x, y, 'V_FIELD');
          var l = Math.sqrt(u * u + v * v);
          x += u * 0.01;
          y += v * 0.01;
          if (x > f.numX * f.h) break;

          c.lineTo(cX(x), cY(y));
        }
        c.stroke();
      }
    }
  }

  if (scene.showObstacle) {
    var r = scene.obstacleRadius + f.h;
    if (scene.showPressure) c.fillStyle = "#000000";
    else c.fillStyle = "#DDDDDD";
    c.beginPath();
    c.arc(cX(scene.obstacleX), cY(scene.obstacleY), cScale * r, 0.0, 2.0 * Math.PI);
    c.closePath();
    c.fill();

    c.lineWidth = 3.0;
    c.strokeStyle = "#000000";
    c.beginPath();
    c.arc(cX(scene.obstacleX), cY(scene.obstacleY), cScale * r, 0.0, 2.0 * Math.PI);
    c.closePath();
    c.stroke();
    c.lineWidth = 1.0;
  }

  if (scene.showPressure) {
    var s = "pressure: " + minP.toFixed(0) + " - " + maxP.toFixed(0) + " N/m";
    c.fillStyle = "#000000";
    c.font = "16px Arial";
    c.fillText(s, 10, 35);
  }
}

function setObstacle(x, y, reset) {
  var vx = 0.0;
  var vy = 0.0;

  if (!reset) {
    vx = (x - scene.obstacleX) / scene.dt;
    vy = (y - scene.obstacleY) / scene.dt;
  }

  scene.obstacleX = x;
  scene.obstacleY = y;
  var r = scene.obstacleRadius;
  var f = scene.fluid;
  var n = f.numY;

  for (var i = 1; i < f.numX - 2; i++) {
    for (var j = 1; j < f.numY - 2; j++) {
      f.s[i * n + j] = 1.0;
      var dx = (i + 0.5) * f.h - x;
      var dy = (j + 0.5) * f.h - y;

      if (dx * dx + dy * dy < r * r) {
        f.s[i * n + j] = 0.0;
        f.u[i * n + j] = vx;
        f.u[(i + 1) * n + j] = vx;
        f.v[i * n + j] = vy;
        f.v[i * n + j + 1] = vy;
      }
    }
  }

  scene.showObstacle = true;
}

var mouseDown = false;

function startDrag(x, y) {
  let bounds = canvas.getBoundingClientRect();
  let mx = x - bounds.left - canvas.clientLeft;
  let my = y - bounds.top - canvas.clientTop;
  mouseDown = true;

  x = mx / cScale;
  y = (canvas.height - my) / cScale;

  setObstacle(x, y, true);
}

function drag(x, y) {
  if (mouseDown) {
    let bounds = canvas.getBoundingClientRect();
    let mx = x - bounds.left - canvas.clientLeft;
    let my = y - bounds.top - canvas.clientTop;
    x = mx / cScale;
    y = (canvas.height - my) / cScale;
    setObstacle(x, y, false);
  }
}

function endDrag() {
  mouseDown = false;
}

canvas.addEventListener('mousedown', event => {
  startDrag(event.x, event.y);
});

canvas.addEventListener('mouseup', event => {
  endDrag();
});

canvas.addEventListener('mousemove', event => {
  drag(event.x, event.y);
});

canvas.addEventListener('touchstart', event => {
  startDrag(event.touches[0].clientX, event.touches[0].clientY);
});

canvas.addEventListener('touchend', event => {
  endDrag();
});

canvas.addEventListener('touchmove', event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  drag(event.touches[0].clientX, event.touches[0].clientY);
}, { passive: false });

document.addEventListener('keydown', event => {
  switch (event.key) {
    case 'p':
      scene.paused = !scene.paused;
      break;
    case 'm':
      scene.paused = false;
      simulate();
      scene.paused = true;
      break;
  }
});

function toggleStart() {
  var button = document.getElementById('startButton');
  if (scene.paused) button.innerHTML = "Stop";
  else button.innerHTML = "Start";
  scene.paused = !scene.paused;
}

function simulate() {
  if (!scene.paused) scene.fluid.simulate(scene.dt, scene.gravity, scene.numIters, scene.overRelaxation);
  scene.frameNr++;
}

let animation;
function update() {
  simulate();
  draw();
  animation = requestAnimationFrame(update);
}

setupScene(1);
animation = requestAnimationFrame(update);

return {animation};

}

export const destroySim = async (sim) => {
    cancelAnimationFrame(sim);
    document.getElementById('fluidsim').remove();
}
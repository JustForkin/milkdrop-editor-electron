const $ = require('jquery');
const _ = require('lodash');
const { ipcRenderer } = require('electron');
const butterchurn = require('butterchurn');
const butterchurnExtraImages = require('butterchurn/lib/butterchurnExtraImages.min.js');
const butterchurnPresets = require('butterchurn-presets');
const butterchurnPresetsExtra = require('butterchurn-presets/lib/butterchurnPresetsExtra.min.js');
const butterchurnPresetsExtra2 = require('butterchurn-presets/lib/butterchurnPresetsExtra2.min.js');

var visualizer = null;
var rendering = false;
var audioContext = null;
var sourceNode = null;
var delayedAudible = null;
var cycleInterval = null;
var presets = {};
var presetKeys = [];
var presetIndexHist = [];
var presetIndex = 0;
var presetCycle = true;
var presetCycleLength = 15000;
var presetRandom = true;
var canvas = document.getElementById('canvas');

function connectToAudioAnalyzer(sourceNode) {
  if(delayedAudible) {
    delayedAudible.disconnect();
  }

  delayedAudible = audioContext.createDelay();
  delayedAudible.delayTime.value = 0.26;

  sourceNode.connect(delayedAudible)
  delayedAudible.connect(audioContext.destination);

  visualizer.connectAudio(delayedAudible);
}

function startRenderer() {
  requestAnimationFrame(() => startRenderer());
  visualizer.render();
}

function playBufferSource(buffer) {
  if (!rendering) {
    rendering = true;
    startRenderer();
  }

  if (sourceNode) {
    sourceNode.disconnect();
  }

  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = buffer;
  connectToAudioAnalyzer(sourceNode);

  sourceNode.start(0);
}

function loadLocalFiles(files, index = 0) {
  audioContext.resume();

  var reader = new FileReader();
  reader.onload = (event) => {
    audioContext.decodeAudioData(
      event.target.result,
      (buf) => {
        playBufferSource(buf);

        setTimeout(() => {
          if (files.length > index + 1) {
            loadLocalFiles(files, index + 1);
          } else {
            sourceNode.disconnect();
            sourceNode = null;
            $("#audioSelectWrapper").css('display', 'block');
          }
        }, buf.duration * 1000);
      }
    );
  };

  var file = files[index];
  reader.readAsArrayBuffer(file);
}

function connectMicAudio(sourceNode, audioContext) {
  audioContext.resume();

  var gainNode = audioContext.createGain();
  gainNode.gain.value = 1.25;
  sourceNode.connect(gainNode);

  visualizer.connectAudio(gainNode);
  startRenderer();
}

function nextPreset(blendTime = 5.7) {
  presetIndexHist.push(presetIndex);

  var numPresets = presetKeys.length;
  if (presetRandom) {
    presetIndex = Math.floor(Math.random() * presetKeys.length);
  } else {
    presetIndex = (presetIndex + 1) % numPresets;
  }

  visualizer.loadPreset(presets[presetKeys[presetIndex]], blendTime);
  $('#presetSelect').val(presetIndex);

  restartCycleInterval();
}

function prevPreset(blendTime = 5.7) {
  var numPresets = presetKeys.length;
  if (presetIndexHist.length > 0) {
    presetIndex = presetIndexHist.pop();
  } else {
    presetIndex = ((presetIndex - 1) + numPresets) % numPresets;
  }

  visualizer.loadPreset(presets[presetKeys[presetIndex]], blendTime);
  $('#presetSelect').val(presetIndex);

  restartCycleInterval();
}

function restartCycleInterval() {
  if (cycleInterval) {
    clearInterval(cycleInterval);
    cycleInterval = null;
  }

  if (presetCycle) {
    cycleInterval = setInterval(() => {
      nextPreset(2.7);
    }, presetCycleLength);
  }
}

$(document).keydown((e) => {
  if (e.which === 32 || e.which === 39) {
    nextPreset(5);
  } else if (e.which === 8 || e.which === 37) {
    prevPreset();
  } else if (e.which === 72) {
    nextPreset(0);
  }
});

$('#presetSelect').change((evt) => {
  presetIndexHist.push(presetIndex);
  presetIndex = parseInt($('#presetSelect').val());
  visualizer.loadPreset(presets[presetKeys[presetIndex]], 5.7);
});

$('#presetCycle').change(() => {
  presetCycle = $('#presetCycle').is(':checked');
  restartCycleInterval();
});

$('#presetCycleLength').change((evt) => {
  presetCycleLength = parseInt($('#presetCycleLength').val() * 1000);
  restartCycleInterval();
});

$('#presetRandom').change(() => {
  presetRandom = $('#presetRandom').is(':checked');
});

$("#localFileBut").click(function() {
  $("#audioSelectWrapper").css('display', 'none');

  var fileSelector = $('<input type="file" accept="audio/*" multiple />');

  fileSelector[0].onchange = function(event) {
    loadLocalFiles(fileSelector[0].files);
  }

  fileSelector.click();
});

$("#micSelect").click(() => {
  $("#audioSelectWrapper").css('display', 'none');

  navigator.getUserMedia({ audio: true }, (stream) => {
    var micSourceNode = audioContext.createMediaStreamSource(stream);
    connectMicAudio(micSourceNode, audioContext);
  }, (err) => {
    console.log('Error getting audio stream from getUserMedia');
  });
});

function initPlayer() {
  AudioContext = window.AudioContext = (window.AudioContext || window.webkitAudioContext);
  audioContext = new AudioContext();

  presets = {};
  if (butterchurnPresets) {
    Object.assign(presets, butterchurnPresets.getPresets());
  }
  if (butterchurnPresetsExtra) {
    Object.assign(presets, butterchurnPresetsExtra.getPresets());
  }
  if (butterchurnPresetsExtra2) {
    Object.assign(presets, butterchurnPresetsExtra2.getPresets());
  }
  presets = _(presets).toPairs().sortBy(([k, v]) => k.toLowerCase()).fromPairs().value();
  presetKeys = _.keys(presets);
  presetIndex = Math.floor(Math.random() * presetKeys.length);

  var presetSelect = document.getElementById('presetSelect');
  for(var i = 0; i < presetKeys.length; i++) {
      var opt = document.createElement('option');
      opt.innerHTML = presetKeys[i].substring(0,60) + (presetKeys[i].length > 60 ? '...' : '');
      opt.value = i;
      presetSelect.appendChild(opt);
  }

  visualizer = butterchurn.createVisualizer(audioContext, canvas , {
    width: 800,
    height: 600,
    mesh_width: 64,
    mesh_height: 48,
    pixelRatio: window.devicePixelRatio || 1,
    textureRatio: 1,
  });
  visualizer.loadExtraImages(butterchurnExtraImages.getImages());
  nextPreset(0);
  restartCycleInterval();
}

var mainWrapper = document.getElementById('mainWrapper');
mainWrapper.addEventListener('dragover', (e) => {
  e.stopPropagation();
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

// Get file data on drop
mainWrapper.addEventListener('drop', (e) => {
  e.stopPropagation();
  e.preventDefault();

  var files = e.dataTransfer.files;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (file.name.match(/\.milk/)) {
      var reader = new FileReader();
      reader.onload = (e2) => {
        ipcRenderer.send('preset-data', reader.result);
      }

      reader.readAsText(file);
    } else if (file.name.match(/\.json/)) {
      var reader = new FileReader();
      reader.onload = (e2) => {
        var preset = JSON.parse(reader.result);
        visualizer.loadPreset(preset, 2.7);
      }

      reader.readAsText(file);
    }
  }
});

ipcRenderer.on('converted-preset', (event, preset) => {
  visualizer.loadPreset(preset, 2.7);
});

initPlayer();

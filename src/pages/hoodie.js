// Source - https://stackoverflow.com/a/42787075
// Posted by 2pha
// Retrieved 2026-01-30, License - CC BY-SA 3.0

var camera, scene, renderer, mesh, material, stats;
var drawStartPos = {x:0, y:0};

init();
setupCanvasDrawing();
animate();

function init() {
    // Renderer.
    renderer = new THREE.WebGLRenderer();
    //renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Add renderer to page
    document.getElementById('threejs-container').appendChild(renderer.domElement);

    // Create camera.
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 400;

    // Create scene.
    scene = new THREE.Scene();

    // Create material
    material = new THREE.MeshPhongMaterial();

    // Create cube and add to scene.
    var geometry = new THREE.BoxGeometry(200, 200, 200, 50, 50, 50);
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Create ambient light and add to scene.
    var light = new THREE.AmbientLight(0x404040); // soft white light
    scene.add(light);

    // Create directional light and add to scene.
    var directionalLight = new THREE.DirectionalLight(0xffffff);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    // Add listener for window resize.
    window.addEventListener('resize', onWindowResize, false);

    // Add stats to page.
    stats = new Stats();
    document.body.appendChild( stats.dom );
}

function setupCanvasDrawing() {
		// get canvas and context
		var drawingCanvas = document.getElementById('drawing-canvas');
    var drawingCanvas2 = document.getElementById('drawing-canvas-2');
    var drawingContext = drawingCanvas.getContext('2d');
    var drawingContext2 = drawingCanvas2.getContext('2d');
    
    // draw white background
    drawingContext.fillStyle = "#FFFFFF";
    drawingContext.fillRect(0,0,128,128);
    drawingContext2.fillStyle = "#000000";
    drawingContext2.fillRect(0,0,128,128);
    
    // set canvas as bumpmap
    material.bumpMap = new THREE.Texture(drawingCanvas);
    material.displacementMap = new THREE.Texture(drawingCanvas2);
    material.displacementScale = 30;
    
    // set the variable to keep track of when to draw
    var paint = false;
    var paint2 = false;
    
    // add canvas event listeners
    drawingCanvas.addEventListener('mousedown', function(e){
      paint = true
      drawStartPos = {x:e.offsetX, y:e.offsetY};
    });
    drawingCanvas.addEventListener('mousemove', function(e){
    	if(paint){
      	draw(drawingContext, 0, e.offsetX, e.offsetY);
      }
    });
    drawingCanvas.addEventListener('mouseup', function(e){
      paint = false;
    });
    drawingCanvas.addEventListener('mouseleave', function(e){
      paint = false;
    });
    
    drawingCanvas2.addEventListener('mousedown', function(e){
      paint2 = true
      drawStartPos = {x:e.offsetX, y:e.offsetY};
    });
    drawingCanvas2.addEventListener('mousemove', function(e){
    	if(paint2){
      	draw(drawingContext2, 1, e.offsetX, e.offsetY);
      }
    });
    drawingCanvas2.addEventListener('mouseup', function(e){
      paint2 = false;
    });
    drawingCanvas2.addEventListener('mouseleave', function(e){
      paint2 = false;
    });
}

// Draw function
function draw(drawContext, type,  x, y) {
  drawContext.moveTo(drawStartPos.x, drawStartPos.y);
  if(type){
  	// is displacement
    drawContext.strokeStyle = '#ffffff';
  }else{
  	// is bump
    drawContext.strokeStyle = '#000000';
  }
	drawContext.lineTo(x,y);
	drawContext.stroke();
  drawStartPos = {x:x, y:y};
  material.bumpMap.needsUpdate = true;
  material.displacementMap.needsUpdate = true;
}

function animate() {
    requestAnimationFrame(animate);
    mesh.rotation.x += 0.005;
    mesh.rotation.y += 0.01;
    renderer.render(scene, camera);
    stats.update();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
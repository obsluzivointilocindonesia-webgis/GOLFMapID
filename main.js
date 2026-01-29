// 1. KONFIGURASI AWAL
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NjFlYWU2Mi0wM2Q4LTQxOWUtYWVkMy05OTU5ZWQ0OTUwNzYiLCJpZCI6Mzc4MTM0LCJpYXQiOjE3NjgzMTQ1MDh9.VCnwzOPc8EycFc62da6fyFF8oJ0lfi1M8cHxKmOV3fs";

const viewer = new Cesium.Viewer('cesiumContainer', {
    terrain: Cesium.Terrain.fromWorldTerrain(),
});

let points = [];
let profileChart = null;
let contourDataSource = null;
let isContourVisible = false;

// 2. LOAD TILESET & CAMERA
async function init() {
    try {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(4345477);
        viewer.scene.primitives.add(tileset);
        
        // Posisi target (Bandung)
        const targetPos = Cesium.Cartesian3.fromDegrees(107.641889, -6.870107, 950);
        viewer.camera.flyTo({
            destination: targetPos,
            orientation: {
                heading: Cesium.Math.toRadians(5),
                pitch: Cesium.Math.toRadians(-15.0),
                roll: 0.0
            },
            duration: 2
        });
    } catch (error) {
        console.error("Gagal memuat Tileset:", error);
    }
}
init();

// 3. EVENT HANDLER: KLIK PETA
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction(async function (movement) {
    const cartesian = viewer.scene.pickPosition(movement.position);
    if (!Cesium.defined(cartesian)) return;

    points.push(cartesian);
    
    // Marker Titik
    viewer.entities.add({
        position: cartesian,
        point: { 
            pixelSize: 10, 
            color: Cesium.Color.YELLOW, 
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY 
        }
    });

    if (points.length === 2) {
        calculateAll(points[0], points[1]);
        points = []; // Reset setelah 2 titik
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// 4. LOGIKA PERHITUNGAN & LABEL
async function calculateAll(p1, p2) {
    const carto1 = Cesium.Cartographic.fromCartesian(p1);
    const carto2 = Cesium.Cartographic.fromCartesian(p2);

    const distance = Cesium.Cartesian3.distance(p1, p2);
    const bedaTinggi = carto2.height - carto1.height;
    const bearing = (Cesium.Math.toDegrees(Math.atan2(
        Math.sin(carto2.longitude - carto1.longitude) * Math.cos(carto2.latitude),
        Math.cos(carto1.latitude) * Math.sin(carto2.latitude) - Math.sin(carto1.latitude) * Math.cos(carto2.latitude) * Math.cos(carto2.longitude - carto1.longitude)
    )) + 360) % 360;
    
    const slopePercent = (bedaTinggi / distance) * 100;

    // Garis
    viewer.entities.add({
        polyline: {
            positions: [p1, p2],
            width: 4,
            material: Cesium.Color.YELLOW,
            clampToGround: true
        }
    });

    // Label Bearing di Titik 1
    viewer.entities.add({
        position: p1,
        label: {
            text: `Arah: ${bearing.toFixed(1)}°\nSlope: ${slopePercent.toFixed(1)}%`,
            font: 'bold 12pt sans-serif',
            fillColor: Cesium.Color.AQUA,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -40),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    // Label Jarak di Titik 2
    viewer.entities.add({
        position: p2,
        label: {
            text: `Jarak: ${distance.toFixed(2)}m\nΔH: ${bedaTinggi.toFixed(2)}m`,
            font: 'bold 12pt sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -40),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });

    generateProfile(p1, p2);
}

// 5. TOGGLE KONTUR (ID: 4383775)
document.getElementById('contourBtn').addEventListener('click', async function() {
    isContourVisible = !isContourVisible;
    this.innerText = `Toggle Contour: ${isContourVisible ? 'ON' : 'OFF'}`;
    this.style.background = isContourVisible ? '#e74c3c' : '#2c3e50';

    try {
        if (!contourDataSource) {
            console.log("Memuat kontur dengan gradasi warna...");
            const resource = await Cesium.IonResource.fromAssetId(4383775);
            contourDataSource = await Cesium.GeoJsonDataSource.load(resource, {
                clampToGround: true 
            });

            const entities = contourDataSource.entities.values;
            let minH = Infinity;
            let maxH = -Infinity;

            // 1. SCAN NILAI MIN & MAX (Ganti 'Kontur' dengan nama properti di file Anda)
            entities.forEach(entity => {
                if (entity.properties && entity.properties.Kontur) {
                    let val = parseFloat(entity.properties.Kontur.getValue());
                    if (!isNaN(val)) {
                        if (val < minH) minH = val;
                        if (val > maxH) maxH = val;
                    }
                }
            });

            // 2. APPLY GRADASI & LABEL
            entities.forEach(entity => {
                if (entity.properties && entity.properties.Kontur) {
                    let h = parseFloat(entity.properties.Kontur.getValue());
                    
                    // Hitung ratio (0.0 untuk terendah, 1.0 untuk tertinggi)
                    let ratio = (h - minH) / (maxH - minH);
                    if (isNaN(ratio)) ratio = 0;

                    // Warna HSL: 0.6 (Biru) ke 0.0 (Merah)
                    const color = Cesium.Color.fromHsl(0.6 * (1.0 - ratio), 1.0, 0.5);

                    if (entity.polyline) {
                        entity.polyline.material = color;
                        entity.polyline.width = 2.5;
                        entity.polyline.classificationType = Cesium.ClassificationType.BOTH;
                    }
                }
            });
        }

        isContourVisible ? viewer.dataSources.add(contourDataSource) : viewer.dataSources.remove(contourDataSource);
    } catch (err) {
        console.error("Gagal memuat gradasi kontur:", err);
    }
});

// 6. CLEAR BUTTON
document.getElementById('clearBtn').addEventListener('click', () => {
    viewer.entities.removeAll();
    if(profileChart) profileChart.destroy();
    document.getElementById('chartContainer').style.display = 'none';
});

// 7. FUNGSI PROFILE (Sama seperti sebelumnya)
async function generateProfile(start, end) {
    const samples = 40;
    const labels = [];
    const heights = [];
    const pointsToSample = [];
    for (let i = 0; i <= samples; i++) {
        pointsToSample.push(Cesium.Cartesian3.lerp(start, end, i / samples, new Cesium.Cartesian3()));
    }
    const clampedPoints = await viewer.scene.clampToHeightMostDetailed(pointsToSample);
    clampedPoints.forEach((pos, i) => {
        if (Cesium.defined(pos)) {
            const h = Cesium.Cartographic.fromCartesian(pos).height;
            labels.push(`${((Cesium.Cartesian3.distance(start, end) / samples) * i).toFixed(0)}m`);
            heights.push(h);
        }
    });
    document.getElementById('chartContainer').style.display = 'block';
    renderChart(labels, heights);
}

function renderChart(labels, data) {
    const ctx = document.getElementById('profileChart').getContext('2d');
    if (profileChart) profileChart.destroy();
    profileChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Elevasi (m)',
                data: data,
                borderColor: '#2ecc71',
                fill: true,
                backgroundColor: 'rgba(46, 204, 113, 0.2)',
                tension: 0.3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
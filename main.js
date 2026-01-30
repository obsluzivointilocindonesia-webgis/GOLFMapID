// 1. KONFIGURASI AWAL
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5NjFlYWU2Mi0wM2Q4LTQxOWUtYWVkMy05OTU5ZWQ0OTUwNzYiLCJpZCI6Mzc4MTM0LCJpYXQiOjE3NjgzMTQ1MDh9.VCnwzOPc8EycFc62da6fyFF8oJ0lfi1M8cHxKmOV3fs";

const viewer = new Cesium.Viewer('cesiumContainer', {
    terrain: Cesium.Terrain.fromWorldTerrain(),
});

viewer.resolutionScale = window.devicePixelRatio;

let activePoints = []; 
let labelsList = []; // Untuk menyimpan label agar mudah dihapus
let profileChart = null;
let contourDataSource = null;
let isContourVisible = false;

// 2. LOAD ASSET
async function init() {
    try {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(4345477);
        viewer.scene.primitives.add(tileset);
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(107.641889, -6.870107, 950),
            orientation: { heading: Cesium.Math.toRadians(5), pitch: Cesium.Math.toRadians(-15.0), roll: 0.0 },
            duration: 2
        });
    } catch (e) { console.error(e); }
}
init();

// 3. FUNGSI PERHITUNGAN BEARING
function getBearing(start, end) {
    const s = Cesium.Cartographic.fromCartesian(start);
    const e = Cesium.Cartographic.fromCartesian(end);
    const y = Math.sin(e.longitude - s.longitude) * Math.cos(e.latitude);
    const x = Math.cos(s.latitude) * Math.sin(e.latitude) - Math.sin(s.latitude) * Math.cos(e.latitude) * Math.cos(e.longitude - s.longitude);
    return (Cesium.Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
}

// 4. UPDATE VISUAL & LABEL (VERSI LABEL DI TITIK AWAL)
function updateVisuals() {
    // Hapus semua label lama
    labelsList.forEach(l => viewer.entities.remove(l));
    labelsList = [];

    if (activePoints.length < 2) return;

    // Gambar ulang garis utama
    const lineId = 'dynamicLine';
    if (viewer.entities.getById(lineId)) viewer.entities.removeById(lineId);
    viewer.entities.add({
        id: lineId,
        polyline: {
            positions: activePoints.map(p => p.position),
            width: 4,
            material: Cesium.Color.YELLOW,
            clampToGround: true
        }
    });

    // Iterasi untuk membuat label
    for (let i = 1; i < activePoints.length; i++) {
        const pStart = activePoints[i-1].position; // Titik Awal Segmen
        const pEnd = activePoints[i].position;     // Titik Akhir Segmen
        
        const cStart = Cesium.Cartographic.fromCartesian(pStart);
        const cEnd = Cesium.Cartographic.fromCartesian(pEnd);

        const dist = Cesium.Cartesian3.distance(pStart, pEnd);
        const deltaH = cEnd.height - cStart.height;
        const bearing = getBearing(pStart, pEnd);
        const slope = (deltaH / dist) * 100;

        // A. Label JARAK (Tetap di tengah segmen)
        const midPos = Cesium.Cartesian3.lerp(pStart, pEnd, 0.5, new Cesium.Cartesian3());
        const distLabel = viewer.entities.add({
            position: midPos,
            label: {
                text: `${dist.toFixed(1)} m`,
                font: 'bold 16pt "Arial Black", Gadget, sans-serif',
                fillColor: Cesium.Color.AQUA,
                outlineWidth: 4,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                heightReference: Cesium.HeightReference.clampToHeightMostDetailed,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                //pixelOffset: new Cesium.Cartesian2(0, -8), // Jauhkan sedikit lagi dari titik agar tidak tertutup jempol
            }
        });
        labelsList.push(distLabel);

        // B. Label INFO DETAIL (diletakkan di pStart / Titik Awal Segmen)
        const infoLabel = viewer.entities.add({
            position: pStart,
            label: {
                text: `ARAH: ${bearing.toFixed(1)}°\nKEMIRINGAN: ${slope.toFixed(1)}%\nΔTINGGI: ${deltaH.toFixed(1)}m`,
                font: 'bold 14pt "Arial Black", Gadget, sans-serif',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 4,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -5), // Offset agak tinggi agar tidak tumpang tindih
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                showBackground: true,
                backgroundColor: new Cesium.Color(0.1, 0.1, 0.1, 0.7), // Hitam transparan
                backgroundPadding: new Cesium.Cartesian2(10, 8),
            }
        });
        labelsList.push(infoLabel);
    }
    generateMultiPointProfile();
}
// 5. EVENT HANDLER KLIK
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction(async function (movement) {
    const cartesian = viewer.scene.pickPosition(movement.position);
    if (!Cesium.defined(cartesian)) return;

    const v = viewer.entities.add({
        position: cartesian,
        point: { pixelSize: 8, color: Cesium.Color.GREEN, disableDepthTestDistance: Number.POSITIVE_INFINITY }
    });
    
    activePoints.push({ position: cartesian, entity: v });
    updateVisuals();
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// 6. MULTI-POINT PROFILE
async function generateMultiPointProfile() {
    const totalSamples = 100;
    const labels = [];
    const heights = [];
    const positions = activePoints.map(p => p.position);
    
    let totalDist = 0;
    for (let i = 0; i < positions.length - 1; i++) totalDist += Cesium.Cartesian3.distance(positions[i], positions[i+1]);

    let cumDist = 0;
    for (let i = 0; i < positions.length - 1; i++) {
        const start = positions[i];
        const end = positions[i+1];
        const segD = Cesium.Cartesian3.distance(start, end);
        const segS = Math.max(2, Math.floor((segD / totalDist) * totalSamples));

        for (let j = 0; j < segS; j++) {
            const r = j / segS;
            const p = Cesium.Cartesian3.lerp(start, end, r, new Cesium.Cartesian3());
            const cl = await viewer.scene.clampToHeightMostDetailed([p]);
            if (cl[0]) {
                const h = Cesium.Cartographic.fromCartesian(cl[0]).height;
                labels.push((cumDist + (r * segD)).toFixed(1) + "m");
                heights.push(h);
            }
        }
        cumDist += segD;
    }
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
                label: 'Elevasi Kumulatif (m)',
                data: data,
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46, 204, 113, 0.2)',
                fill: true,
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// 7. KONTUR & CLEAR
document.getElementById('contourBtn').addEventListener('click', async function() {
    isContourVisible = !isContourVisible;
    this.innerText = `Toggle Contour: ${isContourVisible ? 'ON' : 'OFF'}`;
    this.style.background = isContourVisible ? '#e74c3c' : '#2c3e50';

    try {
        if (!contourDataSource) {
            console.log("Loading Contour with Elevation Grading...");
            const resource = await Cesium.IonResource.fromAssetId(4383775);
            contourDataSource = await Cesium.GeoJsonDataSource.load(resource, { clampToGround: true });

            const entities = contourDataSource.entities.values;
            let minH = Infinity, maxH = -Infinity;

            // Tahap 1: Scan Min/Max Elevation
            entities.forEach(e => {
                const h = e.properties.Kontur ? parseFloat(e.properties.Kontur.getValue()) : null;
                if (h !== null && !isNaN(h)) {
                    if (h < minH) minH = h;
                    if (h > maxH) maxH = h;
                }
            });

            // Tahap 2: Apply Gradasi Biru (Rendah) ke Merah (Tinggi) & Label
            // ... (Bagian Scan Min/Max tetap sama) ...

    entities.forEach(e => {
        const h = e.properties.Kontur ? parseFloat(e.properties.Kontur.getValue()) : 0;
        let ratio = (h - minH) / (maxH - minH);
        if (isNaN(ratio)) ratio = 0;

        const color = Cesium.Color.fromHsl(0.6 * (1.0 - ratio), 1.0, 0.5);

        if (e.polyline) {
            e.polyline.material = color;
            e.polyline.width = 2;
            e.polyline.classificationType = Cesium.ClassificationType.BOTH;

        // Kita ambil titik tengah dari koordinat garis untuk menaruh label
            const positions = e.polyline.positions.getValue();
            if (positions && positions.length > 0) {
                const centerIndex = Math.floor(positions.length / 2);
                const centerPos = positions[centerIndex];

                e.position = centerPos; // Menentukan posisi label pada entity
                e.label = {
                    text: h.toString(),
                    font: 'bold 10pt Verdana, Geneva, sans-serif',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 3,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                // heightReference sangat penting agar tidak tenggelam di bawah terrain
                    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
                    pixelOffset: new Cesium.Cartesian2(0, -5), 
                    eyeOffset: new Cesium.ConstantProperty(new Cesium.Cartesian3(0, 0, -1)), // Memaksa label tampil sedikit di depan garis
                    disableDepthTestDistance: Number.POSITIVE_INFINITY, // Label tembus pandang terhadap objek lain
                    distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 150)
                    };
                }
            }
        });
        }

        isContourVisible ? viewer.dataSources.add(contourDataSource) : viewer.dataSources.remove(contourDataSource);
    } catch (err) { console.error("Contour Load Error:", err); }
});

document.getElementById('clearBtn').addEventListener('click', () => {
    activePoints.forEach(p => viewer.entities.remove(p.entity));
    labelsList.forEach(l => viewer.entities.remove(l));
    if (viewer.entities.getById('dynamicLine')) viewer.entities.removeById('dynamicLine');
    activePoints = []; labelsList = [];
    if (profileChart) profileChart.destroy();
    document.getElementById('chartContainer').style.display = 'none';
});
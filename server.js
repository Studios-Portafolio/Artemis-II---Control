const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors()); 
app.use(express.static(path.join(__dirname)));

const radioTierra = 6371;
const apogeo = 74000;     
const perigeo = 2500;     
const distanciaLuna = 384400; 

const semiEjeMayor = (apogeo + perigeo + 2 * radioTierra) / 2; 
const semiEjeMenor = Math.sqrt((apogeo + radioTierra) * (perigeo + radioTierra)); 
const focoOffset = semiEjeMayor - (perigeo + radioTierra);

const fechaLanzamiento = new Date("2026-04-01T22:35:00Z").getTime();
const fechaInterseccionLunar = new Date("2026-04-05T14:00:00Z").getTime();

function formatearTiempo(ms) {
    if (ms < 0) return "00:00:00:00";
    const dias = Math.floor(ms / (1000 * 60 * 60 * 24));
    const horas = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((ms % (1000 * 60)) / 1000);
    return `${dias.toString().padStart(2, '0')}:${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
}

app.get('/api/artemis', async (req, res) => {
    const ahora = Date.now();
    const metString = "T+ " + formatearTiempo(ahora - fechaLanzamiento);
    const etaString = "T- " + formatearTiempo(fechaInterseccionLunar - ahora);

    const URL_NASA_AROW = 'https://arow.nasa.gov/api/v1/artemis2/telemetry';

    try {
        const respuesta = await axios.get(URL_NASA_AROW, { timeout: 2000 });
        const d = respuesta.data;

        res.json({
            timestamp: d.timestamp,
            fase_mision: d.mission_phase || "EN TRAYECTORIA REAL",
            tiempos: { met: metString, eta_luna: etaString },
            velocidad_kmh: d.velocity_kmh || d.velocity || 0,
            distancia_tierra_km: d.distance_earth_km || d.distance_from_earth || 0,
            posicion_orion: { x: d.x || d.pos_x, y: d.y || d.pos_y, z: d.z || d.pos_z },
            rotacion_orion: { pitch: d.pitch || 0, yaw: d.yaw || 0, roll: d.roll || 0 },
            posicion_luna: { x: -384400, y: 0, z: -10000 } 
        });

    } catch (error) {
        // =========================================================================
        // MOTOR PREDICTIVO ESCALA 1:1 (TIEMPO REAL)
        // =========================================================================
        
        // Una Órbita HEO tarda aprox 42 horas = 151,200,000 milisegundos
        const periodoOrbital = 151200000;
        const tiempoTranscurrido = ahora - fechaLanzamiento;
        
        // Calculamos en qué punto de los 360 grados (2*PI) está la nave AHORA
        const anguloActual = (tiempoTranscurrido % periodoOrbital) / periodoOrbital * 2 * Math.PI;
        // Calculamos dónde estará en 1 segundo para saber hacia dónde apunta (Dirección)
        const anguloSiguiente = ((tiempoTranscurrido + 1000) % periodoOrbital) / periodoOrbital * 2 * Math.PI;

        // La Luna tarda 27.3 días
        const periodoLuna = 2358720000;
        const anguloLuna = (ahora % periodoLuna) / periodoLuna * 2 * Math.PI;

        const xOrion = Math.cos(anguloActual) * semiEjeMayor - focoOffset;
        const zOrion = Math.sin(anguloActual) * semiEjeMenor;
        const yOrion = Math.sin(anguloActual * 0.5) * 6000;

        const distanciaCentro = Math.sqrt(xOrion*xOrion + yOrion*yOrion + zOrion*zOrion);
        const distanciaSuperficie = Math.max(0, distanciaCentro - radioTierra);
        const velocidadReal = 39000 * (15000 / (distanciaSuperficie + 15000)) + 4000;

        const nextX = Math.cos(anguloSiguiente) * semiEjeMayor - focoOffset;
        const nextZ = Math.sin(anguloSiguiente) * semiEjeMenor;
        const nextY = Math.sin(anguloSiguiente * 0.5) * 6000;
        const dx = nextX - xOrion; const dy = nextY - yOrion; const dz = nextZ - zOrion;

        const orientacionYaw = Math.atan2(dx, dz);
        const distanciaXZ = Math.sqrt(dx*dx + dz*dz);
        const orientacionPitch = -Math.atan2(dy, distanciaXZ); 
        // El BBQ Roll (Control Térmico) da una vuelta cada 10 minutos (600,000 ms)
        const orientacionRoll = (ahora % 600000) / 600000 * 2 * Math.PI; 

        const xLuna = Math.cos(anguloLuna) * distanciaLuna;
        const zLuna = Math.sin(anguloLuna) * distanciaLuna;

        res.json({
            timestamp: new Date().toISOString(),
            fase_mision: "Órbita Terrestre Alta (NOMINAL)",
            tiempos: { met: metString, eta_luna: etaString },
            velocidad_kmh: velocidadReal,
            distancia_tierra_km: distanciaSuperficie,
            posicion_orion: { x: xOrion, y: yOrion, z: zOrion },
            rotacion_orion: { pitch: orientacionPitch, yaw: orientacionYaw, roll: orientacionRoll },
            posicion_luna: { x: xLuna, y: 0, z: zLuna } 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`🌍 HOUSTON: SISTEMA HÍBRIDO ACTIVADO`);
    console.log(`⏱️ Físicas escaladas a TIEMPO REAL 1:1`);
    console.log(`===========================================`);
});
// URL de tu Google Sheets publicado como CSV (reemplaza con tu link real)
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSf7mN6wC1ybMOKz1DXWeVjk_kdH6nhXwJRnVDMFAkODkADBkO21aemrcWQkxDSLGZJnnZIdWlqF3d-/pub?gid=0&single=true&output=csv";

// Preguntas de respaldo (Offline / Garantizadas)
let preguntasRespaldo = [
    {
        id: 1,
        pregunta: "¿En qué año fue creada formalmente la Facultad de Medicina de la UBA?",
        opciones: ["1821", "1852", "1887"],
        correcta: 1, // Índice 1 = segunda opción (1852)
        explicacion: "Fue creada formalmente en 1852.",
        imagen: "imagenes/pregunta1.jpg"
    },
    {
        id: 2,
        pregunta: "¿Dónde funciona actualmente la Facultad de Medicina de la UBA?",
        opciones: ["Av. Córdoba", "Paraguay 2155", "Av. Las Heras"],
        correcta: 1,
        explicacion: "Funciona en Paraguay 2155.",
        imagen: "imagenes/pregunta2.jpg"
    }
    // Puedes agregar el resto de tus preguntas aquí o dejarlas sincronizar desde Sheets
];

let preguntasPartida = [];
let indicePreguntaActual = 0;
let puntajeActual = 0;
let nombreJugador = "";
let temporizadorPregunta = null;
let temporizadorAvance = null;
let preguntaRespondida = false;
const TIEMPO_POR_PREGUNTA = 15;

// Inicialización al cargar la página
window.addEventListener("DOMContentLoaded", () => {
    actualizarRankingVisual();

    // Intentar actualizar desde Google Sheets en segundo plano
    sincronizarGoogleSheets();

    document.getElementById("btn-comenzar").addEventListener("click", () => {
        const input = document.getElementById("nombre-jugador");
        nombreJugador = input.value.trim();

        if (nombreJugador === "") {
            alert("Por favor, ingresa un nombre válido para continuar.");
            input.focus();
            return;
        }

        iniciarTrivia();
    });

    document.getElementById("btn-reiniciar").addEventListener("click", () => {
        document.getElementById("pantalla-final").style.display = "none";
        document.getElementById("pantalla-inicio").style.display = "block";
        document.getElementById("nombre-jugador").value = "";
        actualizarRankingVisual();
    });
});

async function sincronizarGoogleSheets() {
    try {
        const respuesta = await fetch(SHEET_CSV_URL);
        if (!respuesta.ok) throw new Error("Error de red");
        const datosCSV = await respuesta.text();
        const preguntasRemotas = parsearCSV(datosCSV);
        if (preguntasRemotas.length > 0) {
            localStorage.setItem("trivia_preguntas_cache", JSON.stringify(preguntasRemotas));
            console.log("Preguntas sincronizadas con Google Sheets exitosamente.");
        }
    } catch (error) {
        console.log("Modo offline o error de CORS. Usando caché local o respaldo.");
    }
}

function parsearCSV(text) {
    const lineas = text.split("\n");
    let resultado = [];
    for (let i = 1; i < lineas.length; i++) {
        let linea = lineas[i].trim();
        if (!linea) continue;
        let cols = linea.split(","); // Nota: si tus celdas tienen comas, asegúrate de limpiarlas
        if (cols.length >= 8) {
            resultado.push({
                id: cols[0],
                pregunta: cols[1],
                opciones: [cols[2], cols[3], cols[4]],
                correcta: parseInt(cols[5]) - 1,
                explicacion: cols[6],
                imagen: "imagenes/" + cols[7].trim()
            });
        }
    }
    return resultado;
}

function obtenerPreguntasDisponibles() {
    let cache = localStorage.getItem("trivia_preguntas_cache");
    if (cache) {
        try {
            return JSON.parse(cache);
        } catch (e) {
            return preguntasRespaldo;
        }
    }
    return preguntasRespaldo;
}

function iniciarTrivia() {
    clearInterval(temporizadorPregunta);
    clearTimeout(temporizadorAvance);
    let pool = obtenerPreguntasDisponibles();
    // Mezclar aleatoriamente y tomar 10 (o las que haya)
    preguntasPartida = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
    indicePreguntaActual = 0;
    puntajeActual = 0;

    // Cambiar de pantalla
    document.getElementById("pantalla-inicio").style.display = "none";
    document.getElementById("pantalla-juego").style.display = "flex";

    document.getElementById("info-jugador").textContent = `Jugador: ${nombreJugador}`;
    
    mostrarPreguntaActual();
}

function mostrarPreguntaActual() {
    clearInterval(temporizadorPregunta);
    clearTimeout(temporizadorAvance);
    if (indicePreguntaActual >= preguntasPartida.length) {
        finalizarTrivia();
        return;
    }

    preguntaRespondida = false;
    document.getElementById("tiempo-restante").textContent = TIEMPO_POR_PREGUNTA;
    document.querySelector(".reloj-pregunta").classList.remove("reloj-urgente");
    document.getElementById("explicacion-texto").style.display = "none";
    const q = preguntasPartida[indicePreguntaActual];
    document.getElementById("info-puntaje").textContent = `Puntaje: ${puntajeActual}`;
    document.getElementById("texto-pregunta").textContent = `${indicePreguntaActual + 1}. ${q.pregunta}`;
    
    // Manejo de imagen JPG
    const contenedorImg = document.getElementById("contenedor-imagen");
    contenedorImg.innerHTML = "";
    if (q.imagen) {
        let img = document.createElement("img");
        img.src = q.imagen;
        img.alt = "Imagen de la pregunta";
        img.style.maxHeight = "200px";
        img.style.display = "block";
        img.style.margin = "10px auto";
        contenedorImg.appendChild(img);
    }

    // Opciones
    const opcionesContainer = document.getElementById("opciones-container");
    opcionesContainer.innerHTML = "";
    
    q.opciones.forEach((opcion, index) => {
        let btn = document.createElement("button");
        btn.textContent = opcion;
        btn.className = "btn-opcion";
        btn.onclick = () => evaluarRespuesta(index, q.correcta);
        opcionesContainer.appendChild(btn);
    });

    iniciarTemporizador();
}

function iniciarTemporizador() {
    let tiempoRestante = TIEMPO_POR_PREGUNTA;
    temporizadorPregunta = setInterval(() => {
        tiempoRestante--;
        document.getElementById("tiempo-restante").textContent = tiempoRestante;
        document.querySelector(".reloj-pregunta").classList.toggle("reloj-urgente", tiempoRestante <= 5);

        if (tiempoRestante <= 0) {
            clearInterval(temporizadorPregunta);
            temporizadorPregunta = null;
            tiempoAgotado();
        }
    }, 1000);
}

function evaluarRespuesta(elegida, correcta) {
    if (preguntaRespondida) return;
    preguntaRespondida = true;
    clearInterval(temporizadorPregunta);
    const botones = document.querySelectorAll(".btn-opcion");
    botones.forEach(b => b.disabled = true); // Desactivar clics múltiples

    if (elegida === correcta) {
        puntajeActual += 10;
        botones[elegida].style.backgroundColor = "#4CAF50"; // Verde
    } else {
        botones[elegida].style.backgroundColor = "#f44336"; // Rojo
        botones[correcta].style.backgroundColor = "#4CAF50"; // Marcar la correcta
    }

    document.getElementById("info-puntaje").textContent = `Puntaje: ${puntajeActual}`;
    temporizadorAvance = setTimeout(() => {
        indicePreguntaActual++;
        mostrarPreguntaActual();
    }, 1500); // Pausa de 1.5 segundos para ver el resultado
}

function tiempoAgotado() {
    if (preguntaRespondida) return;
    preguntaRespondida = true;

    const pregunta = preguntasPartida[indicePreguntaActual];
    const botones = document.querySelectorAll(".btn-opcion");
    botones.forEach((boton) => boton.disabled = true);
    botones[pregunta.correcta].style.backgroundColor = "#4CAF50";

    const explicacion = document.getElementById("explicacion-texto");
    explicacion.textContent = `Se acabó el tiempo. ${pregunta.explicacion || "La respuesta correcta está marcada en verde."}`;
    explicacion.style.display = "block";

    temporizadorAvance = setTimeout(() => {
        indicePreguntaActual++;
        mostrarPreguntaActual();
    }, 1500);
}

function finalizarTrivia() {
    clearInterval(temporizadorPregunta);
    clearTimeout(temporizadorAvance);
    document.getElementById("pantalla-juego").style.display = "none";
    document.getElementById("pantalla-final").style.display = "block";

    document.getElementById("resultado-final").textContent = `¡Excelente trabajo, ${nombreJugador}! Tu puntaje final es de ${puntajeActual} puntos.`;

    guardarEnRanking(nombreJugador, puntajeActual);
}

function guardarEnRanking(nombre, puntos) {
    let ranking = JSON.parse(localStorage.getItem("trivia_ranking_uba")) || [];
    ranking.push({ nombre, puntos, fecha: new Date().toLocaleDateString() });
    ranking.sort((a, b) => b.puntos - a.puntos);
    ranking = ranking.slice(0, 5); // Top 5
    localStorage.setItem("trivia_ranking_uba", JSON.stringify(ranking));
}

function actualizarRankingVisual() {
    const lista = document.getElementById("lista-ranking");
    let ranking = JSON.parse(localStorage.getItem("trivia_ranking_uba")) || [];
    
    if (ranking.length === 0) {
        lista.innerHTML = "<li>Aún no hay registros de puntajes.</li>";
        return;
    }

    lista.innerHTML = "";
    ranking.forEach((item, index) => {
        let li = document.createElement("li");
        li.textContent = `${index + 1}. ${item.nombre} - ${item.puntos} pts`;
        lista.appendChild(li);
    });
}
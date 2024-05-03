require("dotenv").config();
const fs = require("node:fs");
const nombreArchivoPreferencias = "impresoras.json";
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const serial = process.env.LICENCIA_PLUGIN;
let idsUsuarioConImpresoraPreferida = {};
const ALGORITMO_RASTER_BIT_IMAGE = 0;
const MAXIMO_ANCHO = 380;
fs.readFile(nombreArchivoPreferencias, (err, data) => {
    if (err) {
        return;
    }
    idsUsuarioConImpresoraPreferida = JSON.parse(data.toString());
})

const guardarPreferencias = (cb) => {
    fs.writeFile(nombreArchivoPreferencias, JSON.stringify(idsUsuarioConImpresoraPreferida), cb);
}
const obtenerImpresoras = async () => {
    try {
        const urlInvocacion = `http://localhost:8000/impresoras`;
        const httpResponse = await fetch(urlInvocacion);
        return await httpResponse.json();
    } catch (e) {
        return e.message;
    }
}
bot.on('callback_query', (query) => {
    const idChat = query.message.chat.id;
    const impresoraSeleccionada = query.data;
    const idUsuario = query.from.id;
    idsUsuarioConImpresoraPreferida[idUsuario] = impresoraSeleccionada;
    guardarPreferencias(() => {
        bot.sendMessage(idChat, `Tu impresora preferida es ahora '${impresoraSeleccionada}'`);
    });
});


const enviarOperaciones = async (nombreImpresora, operaciones) => {
    try {
        const httpResponse = await fetch("http://localhost:8000/imprimir", {
            method: "POST",
            body: JSON.stringify({
                nombreImpresora: nombreImpresora,
                serial: serial,
                operaciones: operaciones,
            }),
        });
        return httpResponse.json();
    } catch (e) {
        return e.message;
    }
}


const imprimirImagen = async (nombreImpresora, url) => {

    return await enviarOperaciones(nombreImpresora, [
        {
            nombre: "Iniciar",
            argumentos: [],
        },
        {


            nombre: "DescargarImagenDeInternetEImprimir",
            argumentos: [
                url, MAXIMO_ANCHO, ALGORITMO_RASTER_BIT_IMAGE,
            ]
        },
        {
            nombre: "Feed",
            argumentos: [
                1
            ]
        }
    ]);
}
const escribirTexto = async (nombreImpresora, texto) => {
    return await enviarOperaciones(nombreImpresora, [{
        nombre: "Iniciar",
        argumentos: [],
    },
    {
        nombre: "EscribirTexto",
        argumentos: [
            texto
        ]
    },
    {
        nombre: "Feed",
        argumentos: [
            1
        ]
    }
    ]);
}

const descargarHtmlEImprimir = async (nombreImpresora, url) => {
    return await enviarOperaciones(nombreImpresora, [{
        nombre: "Iniciar",
        argumentos: [],
    },
    {
        nombre: "GenerarImagenAPartirDePaginaWebEImprimir",
        argumentos: [
            url, MAXIMO_ANCHO, MAXIMO_ANCHO, ALGORITMO_RASTER_BIT_IMAGE,
        ]
    },
    {
        nombre: "Feed",
        argumentos: [
            1
        ]
    }
    ]);
}

const escribirHtml = async (nombreImpresora, html) => {
    return await enviarOperaciones(nombreImpresora, [{
        nombre: "GenerarImagenAPartirDeHtmlEImprimir",
        argumentos: [html, MAXIMO_ANCHO, MAXIMO_ANCHO, ALGORITMO_RASTER_BIT_IMAGE],
    },
    {
        nombre: "Feed",
        argumentos: [
            1
        ]
    }
    ]);
}


/**
  * @param {number} idChat
  */
const responderConImpresoras = async (idChat) => {
    const impresoras = await obtenerImpresoras();
    if (Array.isArray(impresoras)) {
        const botonesPorFila = 3;
        const botonesBidimensionales = [];
        for (let i = 0; i < impresoras.length; i += botonesPorFila) {
            const filaDeBotones = impresoras.slice(i, i + botonesPorFila);
            botonesBidimensionales.push(filaDeBotones.map(nombreImpresora => ({ text: nombreImpresora, callback_data: nombreImpresora })));
        }
        const teclado = {
            reply_markup: {
                inline_keyboard: botonesBidimensionales,
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };
        await bot.sendMessage(idChat, 'Elige la impresora:', teclado);
    } else {
        await bot.sendMessage(idChat, "Error obteniendo impresoras: " + impresoras);
    }
}

const evaluarRespuestaYEnviarMensajeAUsuario = async (respuestaDelPlugin, idChat) => {
    if (respuestaDelPlugin === true) {
        await bot.sendMessage(idChat, "Impreso correctamente");
    } else {
        await bot.sendMessage(idChat, "Error: " + respuestaDelPlugin);

    }
}

bot.on('message', async (msg) => {
    const idChat = msg.chat.id;
    const idUsuario = msg.from.id;
    if (!idsUsuarioConImpresoraPreferida[idUsuario]) {
        bot.sendMessage(idChat, "Para imprimir, necesitas seleccionar una impresora");
        await responderConImpresoras(idChat);
        return;
    }
    const impresoraPreferida = idsUsuarioConImpresoraPreferida[idUsuario];
    if (msg.entities && msg.entities.length > 0) {
        for (const entidad of msg.entities) {
            const contenidoDeLaEntidad = msg.text.substring(entidad.offset, entidad.offset + entidad.length);
            if (entidad.language === "html") {
                await escribirHtml(impresoraPreferida, contenidoDeLaEntidad);
                await evaluarRespuestaYEnviarMensajeAUsuario(
                    await escribirHtml(impresoraPreferida, contenidoDeLaEntidad), idChat);
            } else if (entidad.language === "json") {
                const operaciones = JSON.parse(contenidoDeLaEntidad);
                if (!Array.isArray(operaciones)) {
                    bot.sendMessage(idChat, "Operaciones JSON deben ser un arreglo");
                    return;
                }
                await evaluarRespuestaYEnviarMensajeAUsuario(
                    await enviarOperaciones(impresoraPreferida, operaciones), idChat);
            } else if (entidad.type === "url") {
                await evaluarRespuestaYEnviarMensajeAUsuario(
                    await descargarHtmlEImprimir(impresoraPreferida, msg.text), idChat);
            }
        }
        return;
    }
    if (msg.text) {
        
        await evaluarRespuestaYEnviarMensajeAUsuario(
            await escribirTexto(impresoraPreferida, msg.text),
            idChat,
        );
    } else if (msg.photo && msg.photo.length > 0) {
        // Creo que la foto más grande siempre se encuentra en
        // msg.photo[msg.photo.length -1] pero no estoy seguro
        // y la documentación no dice nada sobre ello, así que lo calculo
        // manualmente
        let fotoMasGrande = msg.photo[0];
        for (const foto of msg.photo) {
            if (foto.width > fotoMasGrande.width) {
                fotoMasGrande = foto;
            }
        }
        const urlArchivo = await bot.getFileLink(fotoMasGrande.file_id)
        await evaluarRespuestaYEnviarMensajeAUsuario(
            await imprimirImagen(impresoraPreferida, urlArchivo),
            idChat,
        );
    }
});
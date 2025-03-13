const compromise = require('compromise');
const readline = require('readline');
const fs = require('fs');
const axios = require('axios');

// Configuración de readline para la interacción por consola
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Archivo JSON para guardar el historial de conversaciones
const historyFile = 'conversation_history.json';

// Cargar el historial de conversaciones desde el archivo JSON
let conversationHistory = [];
if (fs.existsSync(historyFile)) {
    const data = fs.readFileSync(historyFile, 'utf8');
    conversationHistory = JSON.parse(data);
}

// Función para guardar la conversación en el archivo JSON
function saveConversation(context, question, response, isAccurate) {
    conversationHistory.push({
        context,
        question,
        response,
        isAccurate
    });
    fs.writeFileSync(historyFile, JSON.stringify(conversationHistory, null, 2), 'utf8');
}

// Función para encontrar una respuesta similar en el historial
function findSimilarResponse(context, question) {
    const doc = compromise(question);
    const questionTokens = doc.terms().out('array');

    for (const entry of conversationHistory) {
        if (entry.context === context) {
            const entryDoc = compromise(entry.question);
            const entryTokens = entryDoc.terms().out('array');

            // Comparar similitud de tokens (puedes mejorar esta lógica)
            const similarity = questionTokens.filter(token => entryTokens.includes(token)).length;
            if (similarity > 0) {
                return entry.response;
            }
        }
    }
    return null;
}

// Función para generar una respuesta usando Ollama
async function generateResponseWithOllama(context, question) {
    try {
        // Combinar el contexto y la pregunta del usuario
        const prompt = `Contexto: ${context}\nPregunta: ${question}\nRespuesta:`;
        const response = await axios.post(
            'http://localhost:11434/api/generate',
            {
                model: 'cw2', // Usar el modelo personalizado
                prompt: prompt,
                num_predict: 50, // Limita el tamaño de la respuesta
                temperature: 0.7 // Controla la creatividad de la respuesta
            },
            {
                responseType: 'stream' // Indicar que la respuesta es un stream
            }
        );

        let fullResponse = '';

        // Escuchar los datos en fragmentos
        response.data.on('data', (chunk) => {
            const chunkString = chunk.toString();
            const chunkData = JSON.parse(chunkString);
            fullResponse += chunkData.response; // Concatenar la respuesta
        });

        // Esperar a que termine la respuesta
        await new Promise((resolve, reject) => {
            response.data.on('end', () => resolve());
            response.data.on('error', (error) => reject(error));
        });

        return fullResponse; // Devolver la respuesta completa
    } catch (error) {
        console.error('Error al generar respuesta con Ollama:', error.message);
        return 'Lo siento, no pude generar una respuesta en este momento.';
    }
}


// Función para procesar la pregunta del usuario
async function processQuestion(context, question) {
    // Buscar una respuesta similar en el historial
    const similarResponse = findSimilarResponse(context, question);

    if (similarResponse) {
        console.log(`Respuesta basada en historial: ${similarResponse}`);
        rl.question('¿Es esta respuesta precisa? (1 para sí, 0 para no): ', (answer) => {
            const isAccurate = answer === '1' ? 1 : 0;
            saveConversation(context, question, similarResponse, isAccurate);
            askQuestion();
        });
    } else {
        // Generar una respuesta usando Ollama
        console.log('Generando una respuesta con Ollama...');
        const response = await generateResponseWithOllama(context, question);
        console.log(`Respuesta generada: ${response}`);
        rl.question('¿Es esta respuesta precisa? (1 para sí, 0 para no): ', (answer) => {
            const isAccurate = answer === '1' ? 1 : 0;
            saveConversation(context, question, response, isAccurate);
            askQuestion();
        });
    }
}

// Función para preguntar al usuario
function askQuestion() {
    rl.question('¿Sobre qué quieres preguntar? (menu/horarios/promociones): ', (context) => {
        rl.question('Hazme una pregunta: ', (question) => {
            if (question.toLowerCase() === 'salir') {
                rl.close();
                return;
            }
            processQuestion(context, question);
        });
    });
}

// Iniciar la conversación
askQuestion();
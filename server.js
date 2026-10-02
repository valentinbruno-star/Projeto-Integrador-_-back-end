import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import router from './routes/api.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.use('/api', router);

app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso em http://localhost:${PORT}`);
});

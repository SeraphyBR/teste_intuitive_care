import {Client} from "basic-ftp";
import Path from "path";
import admzip from "adm-zip";
import fs from "fs";
import chardet from "chardet";
import iconv from "iconv-lite";
import {Client as ClientPG} from "pg";
import dotenv from "dotenv";

const download_dir = Path.resolve(__dirname, "..", "..", "csvs");

async function main() {
    // Ler variavels no arquivo .env
    dotenv.config();

    await download_files_from_ftp();
    extration_from_zip();
    encode_conversion();
    await fill_database_with_data();
}

async function download_files_from_ftp() {
    const client = new Client();
    console.log("Iniciando busca e download dos arquivos!");

    client.ftp.verbose = true;
    try {
        await client.access({
            host: "ftp.dadosabertos.ans.gov.br",
        })
        await client.cd("FTP/PDA/demonstracoes_contabeis");
        let directory_list = (await client.list())
            .filter(f => f.type == 2)
            .reverse();
        await client.downloadToDir(download_dir, directory_list[0].name);
        await client.downloadToDir(download_dir, directory_list[1].name);
    }
    catch (err) {
        console.error(err);
    }
    client.close();
}

function extration_from_zip() {
    console.log("Iniciando extração dos arquicos zip baixados!");

    const files_zip = fs.readdirSync(download_dir);
    files_zip.forEach(f => {
        const file_path = Path.resolve(download_dir, f);
        if(file_path.endsWith(".zip")) {
            const zip = new admzip(file_path);
            zip.extractAllTo(download_dir, true);
            fs.rm(file_path, e => e ? console.error(e) : {});
        }
    });
}

function encode_conversion() {
    console.log("Iniciando processo de conversão de encoding dos CSVs para UTF8 !");

    const files_csv = fs.readdirSync(download_dir);
    files_csv.forEach(f => {
        // O sistema de arquivos é alterado tão rapido, que o readdirSync pode retornar
        // nomes de arquivos que foram deletados anteriormente (pode depender do sistema operacional)
        if(f.endsWith(".csv")){
            const file_path = Path.resolve(download_dir, f);
            const encode = chardet.detectFileSync(file_path);
            if(encode) {
                const stream = fs.createReadStream(file_path)
                    .pipe(iconv.decodeStream(encode.toString()))
                    .pipe(iconv.encodeStream('utf8'))
                    .pipe(fs.createWriteStream(file_path + ".tmp"));
                stream.on("finish", () => {
                    fs.renameSync(file_path + ".tmp", file_path);
                    console.log("Re-encoding do arquivo ", f, " para utf8 foi concluido!");
                });
            }
        }
    });
}

async function fill_database_with_data() {
    console.log("Conectando ao banco postgresql para criação e preenchimento das tabelas!");

    const client = new ClientPG({
        connectionString: process.env.DATABASE_URL
    });

    await client.connect();



    await client.end();

}

main();
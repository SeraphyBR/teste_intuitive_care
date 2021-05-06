import axios from "axios";
import cheerio, { Cheerio } from "cheerio";
import Path from "path";
import pdf2json from "pdf2json";
import pr from "pdfreader";
import fs from "fs";
import {download_file} from "./utils";
import { callbackify } from "util";

async function main() {
    const base_url = "http://www.ans.gov.br";
    let path = "/prestadores/tiss-troca-de-informacao-de-saude-suplementar";

    console.log(base_url + path);
    path = await get_path_last_version_TISS(base_url + path);

    console.log(base_url + path);
    path = await get_path_pdf_file(base_url + path);

    console.log(base_url + path);
    const file_path = Path.resolve(__dirname, "..", "static", "padrao_tiss_componente_organizacional.pdf");
    console.log(file_path);
    //await download_file(base_url + path, file_path).catch(console.error);

    get_data_from_pdf(file_path);

}

async function get_path_last_version_TISS(url: string): Promise<string> {
    let path: string = "";
    await axios(url).then(response => {
        const html = response.data;
        const $ = cheerio.load(html);
        const listaTISS = $('.item-1451');
        listaTISS.each((_, e) => {
            const links = $(e).find('ul > li > a');
            let first_link = links.first()
            let href_content = $(first_link).attr("href");
            if(href_content) {
                path = href_content;
                return false; // break
            }
        });
    })
    return path;
}

async function get_path_pdf_file(url: string): Promise<string> {
    let path: string = "";
    await axios(url).then(response => {
        const html = response.data;
        const $ = cheerio.load(html);
        const listaTISS = $('.table-bordered > tbody > tr');
        listaTISS.each((_, e) => {
            const links = $(e).find('td > a');
            let first_link = links.first()
            let href_content = $(first_link).attr("href");
            if(href_content && href_content.endsWith(".pdf")) {
                path = href_content;
                return false; // break
            }
        });
    })
    .catch(console.error);
    return path;
}

function get_data_from_pdf(file_path: string) {
    let pdf_content: string[] = [];

    function done_parse() {
        let quadro_csv = ["", "", ""];

        let quadro30_idx = pdf_content.findIndex(e => e.startsWith("Quadro 30"));
        let quadro31_idx = pdf_content.findIndex(e => e.startsWith("Quadro 31"));
        let quadro32_idx = pdf_content.findIndex(e => e.startsWith("Quadro 32"));

        // O titulo "Quadro 32" é mais distante da tabela em si, do que os demais, por isso
        // devemos encontrar o verdadeiro index de onde começa a tabela.
        // Não pesquisei direto como nos códigos acima, pois, alem de ser um caso isolado de formatação,
        // o titulo da tabela em pdf_content se encontra quebrado com um '\n', e sua primeira parte pode
        // condizer com o começo do titulo dos outros quadros, nesse caso com o quadro 30. "Tabela de Tipo..."
        let not_in_quadro32 = true;
        while(not_in_quadro32 && quadro32_idx < pdf_content.length){
            let condition = pdf_content[quadro32_idx]?.toLowerCase().includes("tabela de tipo")
                            && pdf_content[quadro32_idx + 1]?.toLowerCase().includes("solicitação");
            if(condition){
                not_in_quadro32 = false;
            }
            quadro32_idx += 1;
        }

        quadro30_idx += 3;
        quadro_csv[0] += `${pdf_content[quadro30_idx]},${pdf_content[quadro30_idx + 1]}`;
        quadro30_idx += 2;

        quadro31_idx += 2;
        quadro_csv[1] += `${pdf_content[quadro31_idx]},${pdf_content[quadro31_idx + 1]}`;
        quadro31_idx += 2;

        quadro32_idx += 1;
        quadro_csv[2] += `${pdf_content[quadro32_idx]},${pdf_content[quadro32_idx + 1]}`;
        quadro32_idx += 2;

        let lista_idxs = [quadro30_idx, quadro31_idx, quadro32_idx];

        lista_idxs.forEach((quadro_idx, quadro) => {
            let not_have_exit = true;

            for (let idx = quadro_idx; not_have_exit && idx < pdf_content.length; idx += 2) {
                if(pdf_content[idx]?.toLowerCase().includes("fonte: elaborado pelos autores")) {
                    not_have_exit = false;
                    continue;
                }

                if(pdf_content[idx + 1]?.toLowerCase().includes("padrão tiss - componente organizacional")) {
                    continue;
                }
                else {
                    // Isso significa que um texto foi cortado no meio, e pertence ao anterior
                    if(isNaN(Number(pdf_content[idx].trim()))) {
                        if(pdf_content[idx]?.toLowerCase().includes("solicitar alteração do padrão tiss")) {
                            not_have_exit = false;
                            continue;
                        }
                        quadro_csv[quadro] += ` ${pdf_content[idx].trim()}`;
                        idx -= 1;
                    } else quadro_csv[quadro] += `\n${pdf_content[idx].trim()},${pdf_content[idx + 1].trim()}`;
                };
                //console.log(`\n${pdf_content[idx].trim()},${pdf_content[idx + 1].trim()}`);
            }
        });
        console.log(quadro_csv);

    }

    new pr.PdfReader().parseFileItems(file_path, (err, item) => {
        if (err) console.error(err);
        else if (!item) done_parse();
        else if (item.text) pdf_content.push(item.text);
    });
}

main();
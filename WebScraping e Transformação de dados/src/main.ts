import Path from "path";
import admzip from "adm-zip";
import axios from "axios";
import cheerio from "cheerio";
import downloader from "nodejs-file-downloader";
import fs from "fs";
import pr from "pdfreader";

async function main() {
    const base_url = "http://www.ans.gov.br";
    let path = "/prestadores/tiss-troca-de-informacao-de-saude-suplementar";

    console.log(base_url + path);
    path = await get_path_last_version_TISS(base_url + path);

    console.log(base_url + path);
    path = await get_path_pdf_file(base_url + path);

    console.log(base_url + path);

    const down = new downloader({
        url: base_url + path,
        directory: Path.resolve(__dirname, "..", "static"),
        filename: "padrao_tiss_componente_organizacional.pdf",
        cloneFiles: false
    });

    try {
      await down.download();
    } catch (error) {
       console.log(error)
    }

    get_data_from_pdf(Path.resolve(__dirname, "..", "static", "padrao_tiss_componente_organizacional.pdf"));

}

async function get_path_last_version_TISS(url: string): Promise<string> {
    let path: string = "";
    // Faço uso da biblioteca axios para fazer as requisições ao site
    // Assim obtenho o html e faço uso da biblioteca cheerio para fazer a busca de componentes,
    // seja por meio de uma classe CSS pertencente ao objeto, ou a propria tag.
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

    new pr.PdfReader().parseFileItems(file_path, (err, item) => {
        if (err) console.error(err);
        // Quando tiver acabado o parser, item se torna null, então chamamos a função para extrair
        else if (!item) extract_data_from_pdf(pdf_content);
        else if (item.text) pdf_content.push(item.text);
    });
}

function extract_data_from_pdf(pdf_content: string[]) {
    // Array que vai conter o conteudo em formato csv para os 3 quadros
    let quadro_csv = ["", "", ""];

    // Busco o indice de cada quadro pelo título "Quadro ..." no conteudo do pdf
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

    // Ao verificar como ficou o texto extraido do pdf
    // Eu pulo as posições necessarias para chegar na primeira linha de cada tabela
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

    // Passando por cada quadro, eu vou navegando o conteudo do pdf, extraindo o conteudo da tabela
    // pulando textos que aparecerem no meio (por exemplo, ao mudar de página)
    // e fazendo uso de um texto fora do quadro como condição de termino
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
                // Geralmente espero que o primeiro campo seja um número
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

    // Crio um zip dos csvs
    let zip = new admzip();
    quadro_csv.forEach((quadro, i) => {
        const file_path = Path.resolve(__dirname, "..", "static", `quadro_3${i}.csv`);
        fs.writeFileSync(file_path, quadro);
        zip.addLocalFile(file_path);
    })

    // Salvo o zip com o meu nome
    zip.writeZip(Path.resolve(__dirname, "..", "static", "Teste_Intuitive_Care_Luiz_Junio_Veloso_Dos_Santos.zip"));
}

main();
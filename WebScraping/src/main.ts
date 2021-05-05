import axios from "axios";
import cheerio, { Cheerio } from "cheerio";

async function main() {
    const base_url = "http://www.ans.gov.br";
    let path = "/prestadores/tiss-troca-de-informacao-de-saude-suplementar";

    console.log(base_url + path);

    await axios(base_url + path).then(response => {
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
    .catch(console.error);

    console.log(base_url + path);
}

main();
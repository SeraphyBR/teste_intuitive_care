import * as stream from 'stream';
import fs from 'fs';
import axios from 'axios';
import { promisify } from 'util';

const finished = promisify(stream.finished);

// https://stackoverflow.com/questions/55374755/node-js-axios-download-file-stream-and-writefile
export async function download_file(fileUrl: string, outputLocationPath: string): Promise<any> {
    const writer = fs.createWriteStream(outputLocationPath);
    return axios({
        method: 'get',
        url: fileUrl,
        responseType: 'stream',
    }).then(async response => {
        response.data.pipe(writer);
        return finished(writer); //this is a Promise
    });
}
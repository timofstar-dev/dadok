import {detailsYes24} from '../../_lib/yes24.js';
import {createBooksEndpoint} from '../../_lib/books-endpoint.js';
export const onRequest = createBooksEndpoint('details', detailsYes24);

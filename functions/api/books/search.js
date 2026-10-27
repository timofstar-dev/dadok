import {searchYes24} from '../../_lib/yes24.js';
import {createBooksEndpoint} from '../../_lib/books-endpoint.js';
export const onRequest = createBooksEndpoint('search', searchYes24);

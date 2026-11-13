import { request } from './client';
import type { NewProduct, Page, Product } from './types';

export const listProducts = () => request<Page<Product>>('GET', '/products');

export const createProduct = (product: NewProduct) => request<Product>('POST', '/products', product);

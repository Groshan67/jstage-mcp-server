export type JStageService = 1 | 2 | 3;
export interface JStageQueryParams {
    service: JStageService;
    material?: string;
    article?: string;
    author?: string;
    affil?: string;
    keyword?: string;
    abst?: string;
    text?: string;
    issn?: string;
    cdjournal?: string;
    pubyearfrom?: number;
    pubyearto?: number;
    vol?: number;
    no?: number;
    start?: number;
    count?: number;
    sortflg?: number;
    pubtype?: number;
    lang?: "ja" | "en";
}
export interface JStageEntry {
    [key: string]: unknown;
}
export interface JStageResponse {
    totalResults?: number;
    startIndex?: number;
    itemsPerPage?: number;
    entries: JStageEntry[];
}
export declare class JStageApiError extends Error {
    readonly statusCode?: number | undefined;
    constructor(message: string, statusCode?: number | undefined);
}
export declare function queryJStage(params: JStageQueryParams): Promise<JStageResponse>;

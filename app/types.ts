export type Link = {
    url: string;
    pos: number;
    name: string;
  }
 
export type StartPage = {
    checkURLs: string[];
    audios: Track[];
    message: string;
    openBrowser: boolean;
    bookmarks: Bookmarks;
    loading: boolean;
    error: string;
    editing: Bookmark | undefined;
    metadataEditing: MetadataRequest | undefined;
    currentTrack: Track | undefined;
    currentTime: number,
    playing: boolean,
    category: string | undefined,
    folderOnly: boolean;
}

export type Track = {
    name: string;
    title: string;
    album: string;
    artist: string;
    genre: string;
    duration: number;
}

export type Bookmarks = {
    main: Link[];
    [category: string]: Link[];
}

export type BookmarksProps = {
    handleEdit: (link: Link, category: string, index: number) => void; 
    handleRemove: (category: string, index: number) => void;
    setUpdate: (object: Object) => void
    page: StartPage;
}

export type AudioPlayerProps = {
    page: StartPage;
    setUpdate: (object: Object) => void
    updateMetadata: (metadata: MetadataRequest, callback: (track: Track) => void) => void
}
export type Bookmark = {
    index: number;
    category: string;
    url: string;
    name: string;    
}

export type EditBookmarksProps = {
    page: StartPage;
    handleAdd: (link: Link, category: string) => void,
    handleEdit: (link: Link, category: string, index: number) => void; 
    handleRemove: (category: string, index: number) => void;
    setUpdate: (object: Object) => void
}

export type MetadataKey = "title" | "artist" | "album" | "genre"

export type Metadata = {
    title: string;
    artist: string;
    album: string;
    genre: string;
}

export type MetadataRequest = {
    metadata: Metadata;
    filename: string;
}

export type MetadataResponse = {
    error: string;
    message: string;
}
export interface HealthCheckResult {
    url: string;
    status: number;
}
  
export interface HealthCheckProps {
    urls: string[]
    message: string;
    error: string;
    reload: () => void;
    loading: boolean;
    setUpdate: (object: Object) => void
}

export type Cell = [string, string]; // [type, color]
export type Board = Cell[][];

export interface Piece {
  shape: number[][];
  color: string;
}
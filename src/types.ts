export interface SavePlanArgs {
  name: string;
  content: string;
}

export interface GetPlanArgs {
  name: string;
  version?: string | number;
}

export interface ListDirArgs {
  path: string;
}

export interface ReadFileArgs {
  path: string;
}

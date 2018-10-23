import {RowNode} from "../entities/rowNode";
import {RowNodeTransaction} from "../rowModels/clientSide/clientSideRowModel";
import {ChangedPath} from "../rowModels/clientSide/changedPath";

export interface StageExecuteParams {
    rowNode: RowNode;
    rowNodeTransaction?: RowNodeTransaction;
    rowNodeTransactions?: RowNodeTransaction[];
    rowNodeOrder?: { [id: string]: number };
    changedPath?: ChangedPath;
    reportSortTiming?: boolean;
}

export interface IRowNodeStage {
    execute(params: StageExecuteParams): any;
}

import {RowNode} from "../entities/rowNode";
import {Column} from "../entities/column";
import {_} from "../utils";
import {StageExecuteParams} from "../interfaces/iRowNodeStage";
import {ValueService} from "../valueService/valueService";
import {SortOption} from "./sortService";
import {GridOptionsWrapper} from "../gridOptionsWrapper";

/** less than 1000 in After filter will result in full resort */
export const RESORT_UPPER_BOUND = 1000;
/** more than 100 adds will result in a total resort */
export const RESORT_ADD_LOWER_BOUND = 100;

export class SortServiceSupport {


    constructor(private valueService: ValueService, private gridOptionWrapper: GridOptionsWrapper) {
    }

    /** decide if we want to reSort all **/
    public shouldReSort(rowNode: RowNode, params?: StageExecuteParams) {
        if (_.missing(rowNode.childrenAfterSort)) return true;
        if (!params) return true;
        if (this.hasForceFullSort(params)) return true;
        if ((params.rowNodeTransactions && params.rowNodeTransactions.length > 0) || params.rowNodeTransaction) {
            let countAdds = this.countAddedNodes(params);
            return countAdds > RESORT_ADD_LOWER_BOUND;
        }
        return true;
    }


    /** utility to count how many updates are there ... */
    private countAddedNodes(params: StageExecuteParams) {
        if (params.rowNodeTransactions && params.rowNodeTransactions.length > 0) {
            return params.rowNodeTransactions.reduce((acc, curr) => {
                return acc + curr.add.length;
            }, 0);
        }
        return params.rowNodeTransaction.add.length;
    }

    /** utility to index the rowNodes by ID and keep position ... */
    public indexByRowNodeId(rowNodes: RowNode[]): { [s: string]: { node: RowNode, index: number } } {
        let acc: { [s: string]: { node: RowNode, index: number } } = {};
        return rowNodes.reduce((acc, curr, currIndex) => {
            acc[curr.id] = {node: curr, index: currIndex};
            return acc;
        }, acc);
    }

    /** utility to collect all updates in the transactions */
    public collectUpdates(params: StageExecuteParams): RowNode[] {
        if (params.rowNodeTransaction) {
            return params.rowNodeTransaction.update;
        }
        return params.rowNodeTransactions.reduce((acc, curr) => {
            acc.push(...curr.update);
            return acc;
        }, []);
    }

    /** wrapper for the getValue */
    public getValue(nodeA: RowNode, column: Column) {
        return this.valueService.getValue(column, nodeA);
    }

    /** wrapper for the getOldValue */
    public getOldValue(nodeA: RowNode, column: Column) {
        return this.valueService.getOldValue(column, nodeA);
    }

    /** check if the update had a change to the sort columns , if not , we dont reposition */
    public sortValueChanged(rowNode: RowNode, sortOptions: SortOption[]): boolean {
        return sortOptions.some(sortOption => {
            let col = sortOption.column;
            return this.getValue(rowNode, col) !== this.getOldValue(rowNode, col);
        });
    }

    public compareRowNodes(sortOptions: any, nodeA: RowNode, nodeB: RowNode): number {
        if (nodeA === undefined || nodeB === undefined ){
            console.log('got undefined nodes, seems like an error');
            debugger;
        }
        for (let i = 0, len = sortOptions.length; i < len; i++) {
            let sortOption = sortOptions[i];

            let isInverted = sortOption.inverter === -1;
            let valueA: any = this.getValue(nodeA, sortOption.column);
            let valueB: any = this.getValue(nodeB, sortOption.column);
            let comparatorResult: number;
            if (sortOption.column.getColDef().comparator) {
                //if comparator provided, use it
                comparatorResult = sortOption.column.getColDef().comparator(valueA, valueB, nodeA, nodeB, isInverted);
            } else {
                //otherwise do our own comparison
                comparatorResult = _.defaultComparator(valueA, valueB, this.gridOptionWrapper.isAccentedSort());
            }

            if (comparatorResult !== 0) {
                return comparatorResult * sortOption.inverter;
            }
        }
        return 0; // same
    }

    public placeRowNode(sortOptions: SortOption[], rowToPlace: RowNode, targetArray: RowNode[], startIndex: number, endIndex: number) {
        let beforeStart = this.compareRowNodes(sortOptions, rowToPlace, targetArray[startIndex]) <= 0;
        if (beforeStart) {
            targetArray.splice(startIndex, 0, rowToPlace);
            return;
        }
        let afterEnd = this.compareRowNodes(sortOptions, rowToPlace, targetArray[endIndex]) >= 0;
        if (afterEnd) {
            targetArray.splice(endIndex + 1, 0, rowToPlace);
            return;
        }
        if (endIndex - startIndex < 1) {
            targetArray.splice(endIndex, 0, rowToPlace);
            return;
        }
        let midWay = Math.floor(startIndex + (endIndex - startIndex) / 2);
        let midWayNode = targetArray[midWay];
        let compareToMidWay = this.compareRowNodes(sortOptions, rowToPlace, midWayNode);
        if (compareToMidWay >= 0) {
            this.placeRowNode(sortOptions, rowToPlace, targetArray, midWay, endIndex - 1);
        } else {
            this.placeRowNode(sortOptions, rowToPlace, targetArray, startIndex + 1, midWay);
        }

    }


    private hasForceFullSort(params: StageExecuteParams) {
        if (params.rowNodeTransaction) {
            return !!params.rowNodeTransaction.forceFullSort;
        } else if (params.rowNodeTransactions) {
            return params.rowNodeTransactions.some(x => !!x.forceFullSort);
        }
        return false;
    }
}

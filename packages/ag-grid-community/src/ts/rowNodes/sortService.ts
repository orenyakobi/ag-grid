import {RowNode} from "../entities/rowNode";
import {Column} from "../entities/column";
import {Autowired, Bean, PostConstruct} from "../context/context";
import {SortController} from "../sortController";
import {SortServiceSupport} from './sortServiceSupport';
import {_} from "../utils";
import {ValueService} from "../valueService/valueService";
import {GridOptionsWrapper} from "../gridOptionsWrapper";
import {ColumnController} from "../columnController/columnController";
import {StageExecuteParams} from "../interfaces/iRowNodeStage";

export interface SortOption {
    inverter: number;
    column: Column;
}

export interface SortedRowNode {
    currentPos: number;
    rowNode: RowNode;
}

@Bean('sortService')
export class SortService {

    @Autowired('sortController') private sortController: SortController;
    @Autowired('columnController') private columnController: ColumnController;
    @Autowired('valueService') private valueService: ValueService;
    @Autowired('gridOptionsWrapper') private gridOptionsWrapper: GridOptionsWrapper;

    private postSortFunc: (rowNodes: RowNode[]) => void;
    private sortServiceSupport: SortServiceSupport;

    @PostConstruct
    public init(): void {
        this.postSortFunc = this.gridOptionsWrapper.getPostSortFunc();
        this.sortServiceSupport = new SortServiceSupport(this.valueService, this.gridOptionsWrapper);
    }

    public sortAccordingToColumnsState(rowNode: RowNode, params: StageExecuteParams) {
        let sortOptions: SortOption[] = this.sortController.getSortForRowController();
        this.sort(rowNode, sortOptions, params);
    }

    public sort(rowNode: RowNode, sortOptions: SortOption[], params: StageExecuteParams = null) {
        let shouldTimeExecution = !!params && params.reportSortTiming && rowNode.parent == null;
        let start = new Date();
        let fullSorting = this.sortServiceSupport.shouldReSort(rowNode, params);
        if (fullSorting) {
            this.fullSort(rowNode, sortOptions);
        } else {
            this.deltaSort(rowNode, sortOptions, params);
        }
        // After sort, sort children and
        rowNode.childrenAfterFilter.forEach(child => {
            if (child.hasChildren()) {
                this.sort(child, sortOptions, params);
            }
            delete child.oldData;
        });
        delete rowNode.oldData;

        if (this.postSortFunc) {
            this.postSortFunc(rowNode.childrenAfterSort);
        }
        let end = new Date();
        if (shouldTimeExecution) {
            console.log(`Total time to ${fullSorting ? 'Full Sorting' : 'Partial Sorting'} ROWID ${rowNode.id} was ${end.getTime() - start.getTime()}ms`);
        }

    }

    public fullSort(rowNode: RowNode, sortOptions: SortOption[]) {
        rowNode.childrenAfterSort = rowNode.childrenAfterFilter.slice(0);

        // we clear out the 'pull down open parents' first, as the values mix up the sorting
        this.pullDownDataForHideOpenParents(rowNode, true);

        let sortActive = _.exists(sortOptions) && sortOptions.length > 0;
        if (sortActive) {
            // RE https://ag-grid.atlassian.net/browse/AG-444
            //Javascript sort is non deterministic when all the array items are equals
            //ie Comparator always returns 0, so if you want to ensure the array keeps its
            //order, then you need to add an additional sorting condition manually, in this
            //case we are going to inspect the original array position
            let sortedRowNodes: SortedRowNode[] = rowNode.childrenAfterSort.map((it, pos) => {
                return {currentPos: pos, rowNode: it};
            });
            sortedRowNodes.sort(this.compareSortedRowNodes.bind(this, sortOptions));
            rowNode.childrenAfterSort = sortedRowNodes.map(sorted => sorted.rowNode);
        }

        this.updateChildIndexes(rowNode);
        this.pullDownDataForHideOpenParents(rowNode, false);

    }

    private compareSortedRowNodes(sortOptions: any, sortedNodeA: SortedRowNode, sortedNodeB: SortedRowNode): number {
        let nodeA: RowNode = sortedNodeA.rowNode;
        let nodeB: RowNode = sortedNodeB.rowNode;

        let dataCompare = this.compareRowNodes(sortOptions, nodeA, nodeB);
        // All matched, we make is so that the original sort order is kept:
        return dataCompare === 0 ? sortedNodeA.currentPos - sortedNodeB.currentPos : dataCompare;
    }

    private compareRowNodes(sortOptions: SortOption[], nodeA: RowNode, nodeB: RowNode) {
        return this.sortServiceSupport.compareRowNodes(sortOptions, nodeA, nodeB);
    }


    private updateChildIndexes(rowNode: RowNode) {
        if (_.missing(rowNode.childrenAfterSort)) {
            return;
        }

        rowNode.childrenAfterSort.forEach((child: RowNode, index: number) => {
            let firstChild = index === 0;
            let lastChild = index === rowNode.childrenAfterSort.length - 1;
            child.setFirstChild(firstChild);
            child.setLastChild(lastChild);
            child.setChildIndex(index);
        });
    }

    private pullDownDataForHideOpenParents(rowNode: RowNode, clearOperation: boolean) {
        if (_.missing(rowNode.childrenAfterSort)) {
            return;
        }

        if (!this.gridOptionsWrapper.isGroupHideOpenParents()) {
            return;
        }

        rowNode.childrenAfterSort.forEach(childRowNode => {

            let groupDisplayCols = this.columnController.getGroupDisplayColumns();
            groupDisplayCols.forEach(groupDisplayCol => {

                let showRowGroup = groupDisplayCol.getColDef().showRowGroup;
                if (typeof showRowGroup !== 'string') {
                    console.error('ag-Grid: groupHideOpenParents only works when specifying specific columns for colDef.showRowGroup');
                    return;
                }
                let displayingGroupKey: string = <string> showRowGroup;

                let rowGroupColumn = this.columnController.getPrimaryColumn(displayingGroupKey);

                let thisRowNodeMatches = rowGroupColumn === childRowNode.rowGroupColumn;
                if (thisRowNodeMatches) {
                    return;
                }

                if (clearOperation) {
                    // if doing a clear operation, we clear down the value for every possible group column
                    childRowNode.setGroupValue(groupDisplayCol.getId(), null);
                } else {
                    // if doing a set operation, we set only where the pull down is to occur
                    let parentToStealFrom = childRowNode.getFirstChildOfFirstChild(rowGroupColumn);
                    if (parentToStealFrom) {
                        childRowNode.setGroupValue(groupDisplayCol.getId(), parentToStealFrom.key);
                    }
                }
            });
        });
    }


    private deltaSort(rowNode: RowNode, sortOptions: SortOption[], params: StageExecuteParams) {
        this.pullDownDataForHideOpenParents(rowNode, true);

        let indexedAfterFilter = this.sortServiceSupport.indexByRowNodeId(rowNode.childrenAfterFilter);
        let indexedCurrentSorting = this.sortServiceSupport.indexByRowNodeId(rowNode.childrenAfterSort);
        Object.keys(indexedAfterFilter).forEach(rowNodeId => {
            let inSorting = indexedCurrentSorting[rowNodeId];
            if (inSorting) {
                delete indexedAfterFilter[rowNodeId];
                delete indexedCurrentSorting[rowNodeId];
            }
        });
        // remove left over inSorting that were not in filtering
        Object.keys(indexedCurrentSorting).forEach(rowNodeId => {
            let inSorting = indexedCurrentSorting[rowNodeId];
            rowNode.childrenAfterSort.splice(inSorting.index, 1);
        });
        // reindex for update and move
        let updateNodes = this.sortServiceSupport.collectUpdates(params);
        updateNodes.forEach((value => {
            let currentIndexInSort = rowNode.childrenAfterSort.indexOf(value);
            // we have to have more than 1 in the sort yo update it ...
            if (rowNode.childrenAfterSort.length > 1 && rowNode.childrenAfterFilter.indexOf(value) !== -1 && currentIndexInSort !== -1) { // if included in our nodeAfterFilter and in our current sort
                if (this.sortServiceSupport.sortValueChanged(value, sortOptions)) {
                    let updatedRow = rowNode.childrenAfterSort.splice(currentIndexInSort, 1)[0];
                    this.sortServiceSupport.placeRowNode(sortOptions, updatedRow, rowNode.childrenAfterSort,
                        0, rowNode.childrenAfterSort.length - 1);
                }
            }
        }));
        Object.keys(indexedAfterFilter).forEach(rowNodeId => {
            let rowToInsert = indexedAfterFilter[rowNodeId];
            this.sortServiceSupport.placeRowNode(sortOptions, rowToInsert.node, rowNode.childrenAfterSort,
                0, rowNode.childrenAfterSort.length - 1);
        });
        this.pullDownDataForHideOpenParents(rowNode, false);
        this.updateChildIndexes(rowNode);


    }
}

import {
    ExcelCell,
    ExcelOOXMLDataType,
    ExcelStyle,
    ExcelWorksheet,
    _
} from '@ag-grid-community/core';

import { ExcelXlsxFactory } from './excelXlsxFactory';
import { BaseExcelSerializingSession } from './baseExcelSerializingSession';

export class ExcelXlsxSerializingSession extends BaseExcelSerializingSession<ExcelOOXMLDataType> {

    protected createExcel(data: ExcelWorksheet): string {
        const { excelStyles, config } = this;
        const { sheetConfig, sheetHeaderFooterConfig } = config;
        
        return ExcelXlsxFactory.createExcel(
            excelStyles, 
            data,
            sheetConfig,
            sheetHeaderFooterConfig
        );
    }

    protected getDataTypeForValue(valueForCell: string): ExcelOOXMLDataType {
        return _.isNumeric(valueForCell) ? 'n' : 's';
    }

    protected getType(type: ExcelOOXMLDataType, style: ExcelStyle | null, value: string | null): ExcelOOXMLDataType | null {
        if (this.isFormula(value)) { return 'f'; }

        if (style && style.dataType) {
            switch (style.dataType.toLocaleLowerCase()) {
                case 'formula':
                    return 'f';
                case 'string':
                    return 's';
                case 'number':
                    return 'n';
                case 'datetime':
                    return 'd';
                case 'error':
                    return 'e';
                case 'boolean':
                    return 'b';
                default:
                    console.warn(`ag-grid: Unrecognized data type for excel export [${style.id}.dataType=${style.dataType}]`);
            }
        }

        return type;
    }

    protected createCell(styleId: string | null, type: ExcelOOXMLDataType, value: string): ExcelCell {
        const actualStyle: ExcelStyle | null = this.getStyleById(styleId);
        const typeTransformed = this.getType(type, actualStyle, value) || type;;

        return {
            styleId: actualStyle ? styleId! : undefined,
            data: {
                type: typeTransformed,
                value: this.getCellValue(typeTransformed, value)
            }
        };
    }

    protected createMergedCell(styleId: string | null, type: ExcelOOXMLDataType, value: string, numOfCells: number): ExcelCell {
        return {
            styleId: !!this.getStyleById(styleId) ? styleId! : undefined,
            data: {
                type: type,
                value: type === 's'? ExcelXlsxFactory.getStringPosition(value == null ? '' : value).toString() : value
            },
            mergeAcross: numOfCells
        };
    }

    private getCellValue(type: ExcelOOXMLDataType, value: string | null): string | null {
        if (value == null) { return ExcelXlsxFactory.getStringPosition('').toString(); }

        switch (type) {
            case 's':
                return ExcelXlsxFactory.getStringPosition(value).toString();
            case 'f':
                return value.slice(1);
            case 'n':
                return Number(value).toString();
            default: 
                return value;
        }
    }
}

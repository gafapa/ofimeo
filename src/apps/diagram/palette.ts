// Libraries shown in the diagram editor's left sidebar. Styles are copied from
// draw.io's sidebars (grapheditor/Sidebar.js, diagramly/sidebar/Sidebar-*.js,
// Copyright (c) 2006-2025 JGraph Holdings Ltd / draw.io AG, Apache-2.0) so that
// shapes look the same in both editors.

import type { CellRecord } from './model'
import { t } from '../../core/i18n'

// A child cell of a template (geometry relative to its parent's origin).
export interface PaletteCell {
  value?: string
  style: string
  x: number
  y: number
  width: number
  height: number
  connectable?: boolean
  children?: PaletteCell[]
}

// Vertex template, or an edge template (edge: true) that runs from
// (0, height) to (width, 0) like draw.io's edge templates.
export interface PaletteItem {
  label: string
  style: string
  width: number
  height: number
  value?: string
  edge?: boolean
  // Optional child cells (UML classes, ER tables, lists).
  children?: PaletteCell[]
  // Templates with several cells (e.g. from draw.io's libraries): the cells to
  // insert, top-level ones without parent; style/width/height then only describe the preview.
  cells?: CellRecord[]
  // Extra search words.
  tags?: string
}

export interface PaletteLibrary {
  id: string
  name: string
  items: PaletteItem[]
}

const textStyle = 'text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;'
const listItem = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;'
const umlField = 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;'
const umlDivider = 'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=inherit;'
const lifeline = 'shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;dropTarget=0;collapsible=0;recursiveResize=0;outlineConnect=0;portConstraint=eastwest;newEdgeStyle={"curved":0,"rounded":0};'
const activation = 'html=1;points=[[0,0,0,0,5],[0,1,0,0,-5],[1,0,0,0,5],[1,1,0,0,-5]];perimeter=orthogonalPerimeter;outlineConnect=0;targetShapes=umlLifeline;portConstraint=eastwest;newEdgeStyle={"curved":0,"rounded":0};'
const hr = '<hr size="1" style="border-style:solid;"/>'
const erRow = 'text;strokeColor=none;fillColor=none;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;fontSize=12;whiteSpace=wrap;html=1;'
const tableRow = 'shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;top=0;left=0;right=0;'
const tableCell = 'shape=partialRectangle;connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;whiteSpace=wrap;html=1;'

const rows = (style: string, values: string[], width: number, height: number, y0: number): PaletteCell[] =>
  values.map((value, i) => ({ value, style, x: 0, y: y0 + i * height, width, height }))

// Row of an ER table: key column (30px) and name column.
const erTableRow = (key: string, name: string, y: number, bottom: boolean, keyStyle = ''): PaletteCell => ({
  style: tableRow + `bottom=${bottom ? 1 : 0};`,
  x: 0,
  y,
  width: 180,
  height: 30,
  children: [
    { value: key, style: tableCell + keyStyle, x: 0, y: 0, width: 30, height: 30, connectable: false },
    { value: name, style: tableCell + 'align=left;spacingLeft=6;' + keyStyle, x: 30, y: 0, width: 150, height: 30, connectable: false },
  ],
})

const lineTypes = ['classic', 'classicThin', 'block', 'blockThin', 'open', 'openThin', 'oval', 'diamond', 'diamondThin', 'dash', 'cross', 'circle', 'circlePlus', 'box', 'halfCircle', 'async', 'doubleBlock', 'baseDash']

export const PALETTE: PaletteLibrary[] = [
  {
    id: 'general',
    name: t('General'),
    items: [
      { label: t('Rectangle'), style: 'rounded=0;whiteSpace=wrap;html=1;', width: 120, height: 60 },
      { label: t('Rounded Rectangle'), style: 'rounded=1;whiteSpace=wrap;html=1;', width: 120, height: 60 },
      { label: t('Text'), style: textStyle, width: 60, height: 30, value: t('Text') },
      {
        label: t('Textbox'),
        style: 'text;html=1;whiteSpace=wrap;overflow=hidden;rounded=0;',
        width: 180,
        height: 120,
        value: `<h1 style="margin-top: 0px;">${t('Heading')}</h1><p>Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`,
      },
      { label: t('Ellipse'), style: 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;', width: 120, height: 80 },
      { label: t('Square'), style: 'whiteSpace=wrap;html=1;aspect=fixed;', width: 80, height: 80 },
      { label: t('Circle'), style: 'ellipse;whiteSpace=wrap;html=1;shapeInside=1;aspect=fixed;', width: 80, height: 80 },
      { label: t('Process'), style: 'shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 120, height: 60 },
      { label: t('Diamond'), style: 'rhombus;whiteSpace=wrap;html=1;shapeInside=1;', width: 80, height: 80 },
      { label: t('Parallelogram'), style: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 60 },
      { label: t('Hexagon'), style: 'shape=hexagon;perimeter=hexagonPerimeter2;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 80 },
      { label: t('Triangle'), style: 'triangle;whiteSpace=wrap;html=1;shapeInside=1;', width: 60, height: 80 },
      { label: t('Cylinder'), style: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;', width: 60, height: 80 },
      { label: t('Cloud'), style: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;', width: 120, height: 80 },
      { label: t('Document'), style: 'shape=document;whiteSpace=wrap;html=1;boundedLbl=1;', width: 120, height: 80 },
      { label: t('Internal Storage'), style: 'shape=internalStorage;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: t('Cube'), style: 'shape=cube;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;darkOpacity=0.05;darkOpacity2=0.1;', width: 120, height: 80 },
      { label: t('Step'), style: 'shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 80 },
      { label: t('Trapezoid'), style: 'shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 120, height: 60 },
      { label: t('Tape'), style: 'shape=tape;whiteSpace=wrap;html=1;', width: 120, height: 100 },
      { label: t('Note'), style: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;', width: 80, height: 100 },
      { label: t('Card'), style: 'shape=card;whiteSpace=wrap;html=1;', width: 80, height: 100 },
      { label: t('Callout'), style: 'shape=callout;whiteSpace=wrap;html=1;perimeter=calloutPerimeter;', width: 120, height: 80 },
      { label: t('Wedge Callout'), style: 'shape=wedgeCallout;whiteSpace=wrap;html=1;', width: 120, height: 80 },
      { label: t('Actor'), style: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;', width: 30, height: 60, value: t('Actor') },
      { label: t('Or'), style: 'shape=xor;whiteSpace=wrap;html=1;shapeInside=1;', width: 60, height: 80 },
      { label: t('And'), style: 'shape=or;whiteSpace=wrap;html=1;shapeInside=1;', width: 60, height: 80 },
      { label: t('Data Storage'), style: 'shape=dataStorage;whiteSpace=wrap;html=1;shapeInside=1;fixedSize=1;', width: 100, height: 80 },
      { label: t('Container'), style: 'swimlane;startSize=0;', width: 200, height: 200 },
      { label: t('Vertical Container'), style: 'swimlane;whiteSpace=wrap;html=1;', width: 200, height: 200, value: t('Vertical Container') },
      { label: t('Horizontal Container'), style: 'swimlane;horizontal=0;whiteSpace=wrap;html=1;', width: 200, height: 200, value: t('Horizontal Container') },
      {
        label: t('List'),
        style: 'swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
        width: 140,
        height: 120,
        value: t('List'),
        children: rows(listItem, [1, 2, 3].map((n) => t('Item {n}', { n })), 140, 30, 30),
      },
      { label: t('List Item'), style: listItem, width: 80, height: 30, value: t('List Item') },
      { label: t('Double Rectangle'), style: 'shape=ext;double=1;rounded=0;whiteSpace=wrap;html=1;', width: 120, height: 80 },
      { label: t('Double Rounded Rectangle'), style: 'shape=ext;double=1;rounded=1;whiteSpace=wrap;html=1;', width: 120, height: 80 },
      { label: t('Double Ellipse'), style: 'ellipse;shape=doubleEllipse;whiteSpace=wrap;html=1;', width: 100, height: 60 },
      { label: t('Tape Data'), style: 'shape=tapeData;whiteSpace=wrap;html=1;perimeter=ellipsePerimeter;', width: 80, height: 80 },
      { label: t('Manual Input'), style: 'shape=manualInput;boundedLbl=1;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: t('Loop Limit'), style: 'shape=loopLimit;whiteSpace=wrap;html=1;', width: 100, height: 80 },
      { label: t('Off Page Connector'), style: 'shape=offPageConnector;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: t('Delay'), style: 'shape=delay;whiteSpace=wrap;html=1;', width: 80, height: 40 },
      { label: t('Display'), style: 'shape=display;whiteSpace=wrap;html=1;', width: 80, height: 40 },
      { label: t('Arrow Left'), style: 'shape=singleArrow;direction=west;whiteSpace=wrap;html=1;', width: 100, height: 60 },
      { label: t('Arrow Right'), style: 'shape=singleArrow;whiteSpace=wrap;html=1;', width: 100, height: 60 },
      { label: t('Arrow Up'), style: 'shape=singleArrow;direction=north;whiteSpace=wrap;html=1;', width: 60, height: 100 },
      { label: t('Arrow Down'), style: 'shape=singleArrow;direction=south;whiteSpace=wrap;html=1;', width: 60, height: 100 },
      { label: t('Double Arrow'), style: 'shape=doubleArrow;whiteSpace=wrap;html=1;', width: 100, height: 60 },
      { label: t('Double Arrow Vertical'), style: 'shape=doubleArrow;direction=south;whiteSpace=wrap;html=1;', width: 60, height: 100 },
      { label: t('User'), style: 'shape=actor;whiteSpace=wrap;html=1;', width: 40, height: 60 },
      { label: t('Cross'), style: 'shape=cross;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: t('Corner'), style: 'shape=corner;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: t('Tee'), style: 'shape=tee;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: t('Data Store'), style: 'shape=datastore;whiteSpace=wrap;html=1;', width: 60, height: 60 },
      { label: t('Or (circle)'), style: 'shape=orEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: t('Sum'), style: 'shape=sumEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: t('Ellipse with horizontal divider'), style: 'shape=lineEllipse;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: t('Ellipse with vertical divider'), style: 'shape=lineEllipse;line=vertical;perimeter=ellipsePerimeter;whiteSpace=wrap;html=1;backgroundOutline=1;', width: 80, height: 80 },
      { label: t('Sort'), style: 'shape=sortShape;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: t('Collate'), style: 'shape=collate;whiteSpace=wrap;html=1;', width: 80, height: 80 },
      { label: t('Switch'), style: 'shape=switch;whiteSpace=wrap;html=1;', width: 60, height: 60 },
      { label: t('Left Curly Bracket'), style: 'shape=curlyBracket;whiteSpace=wrap;html=1;rounded=1;labelPosition=left;verticalLabelPosition=middle;align=right;verticalAlign=middle;', width: 20, height: 120 },
      { label: t('Right Curly Bracket'), style: 'shape=curlyBracket;whiteSpace=wrap;html=1;rounded=1;flipH=1;labelPosition=right;verticalLabelPosition=middle;align=left;verticalAlign=middle;', width: 20, height: 120 },
      { label: t('Horizontal Line'), style: 'line;strokeWidth=2;html=1;', width: 160, height: 10 },
      { label: t('Vertical Line'), style: 'line;strokeWidth=2;direction=south;html=1;', width: 10, height: 160 },
      { label: t('Horizontal Crossbar'), style: 'shape=crossbar;whiteSpace=wrap;html=1;rounded=1;', width: 120, height: 20 },
      { label: t('Isometric Cube'), style: 'html=1;whiteSpace=wrap;shape=isoCube2;backgroundOutline=1;isoAngle=15;', width: 90, height: 100 },
      { label: t('Partial Rectangle'), style: 'shape=partialRectangle;whiteSpace=wrap;html=1;left=0;right=0;fillColor=none;', width: 120, height: 60 },
      { label: t('Curve'), style: 'curved=1;endArrow=classic;html=1;', width: 50, height: 50, edge: true },
      { label: t('Bidirectional Arrow'), style: 'shape=flexArrow;endArrow=classic;startArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: t('Arrow'), style: 'shape=flexArrow;endArrow=classic;html=1;', width: 50, height: 50, edge: true },
      { label: t('Dashed Line'), style: 'endArrow=none;dashed=1;html=1;', width: 50, height: 50, edge: true },
      { label: t('Dotted Line'), style: 'endArrow=none;dashed=1;html=1;dashPattern=1 3;strokeWidth=2;', width: 50, height: 50, edge: true },
      { label: t('Line'), style: 'endArrow=none;html=1;', width: 50, height: 50, edge: true },
      { label: t('Bidirectional Connector'), style: 'endArrow=classic;startArrow=classic;html=1;', width: 50, height: 50, edge: true },
      { label: t('Directional Connector'), style: 'endArrow=classic;html=1;', width: 50, height: 50, edge: true },
      { label: t('Link'), style: 'shape=link;html=1;', width: 100, height: 0, edge: true },
    ],
  },
  {
    id: 'flowchart',
    name: t('Flowchart'),
    items: [
      { label: t('Annotation 1'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.annotation_1;align=left;pointerEvents=1;', width: 50, height: 100 },
      { label: t('Annotation 2'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.annotation_2;align=left;labelPosition=right;pointerEvents=1;', width: 50, height: 100 },
      { label: t('Card'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=card;whiteSpace=wrap;size=20;arcSize=12;', width: 100, height: 60 },
      { label: t('Collate'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.collate;', width: 100, height: 100 },
      { label: t('Data'), style: 'shape=parallelogram;html=1;strokeWidth=2;perimeter=parallelogramPerimeter;whiteSpace=wrap;rounded=1;arcSize=12;size=0.23;', width: 100, height: 60 },
      { label: t('Database'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.database;whiteSpace=wrap;', width: 60, height: 60 },
      { label: t('Decision'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.decision;whiteSpace=wrap;', width: 100, height: 100 },
      { label: t('Delay'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.delay;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Direct Data'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.direct_data;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Display'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.display;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Document'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.document2;whiteSpace=wrap;size=0.25;', width: 100, height: 60 },
      { label: t('Extract or Measurement'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.extract_or_measurement;whiteSpace=wrap;', width: 95, height: 60 },
      { label: t('Internal Storage'), style: 'shape=internalStorage;whiteSpace=wrap;html=1;dx=15;dy=15;rounded=1;arcSize=8;strokeWidth=2;', width: 70, height: 70 },
      { label: t('Loop Limit'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.loop_limit;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Manual Input'), style: 'html=1;strokeWidth=2;shape=manualInput;boundedLbl=1;whiteSpace=wrap;rounded=1;size=26;arcSize=11;', width: 100, height: 60 },
      { label: t('Manual Operation'), style: 'verticalLabelPosition=middle;verticalAlign=middle;html=1;shape=trapezoid;perimeter=trapezoidPerimeter;whiteSpace=wrap;size=0.23;arcSize=10;flipV=1;labelPosition=center;align=center;', width: 100, height: 60 },
      { label: t('Merge or Storage'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.merge_or_storage;whiteSpace=wrap;', width: 95, height: 60 },
      { label: t('Multi-Document'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.multi-document;whiteSpace=wrap;boundedLbl=1;', width: 88, height: 60 },
      { label: t('Off-Page Reference'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=offPageConnector;rounded=0;size=0.5;', width: 60, height: 60 },
      { label: t('On-Page Reference'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.on-page_reference;', width: 60, height: 60 },
      { label: t('Or'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.or_2;', width: 70, height: 70 },
      { label: t('Tape'), style: 'shape=tape;whiteSpace=wrap;html=1;strokeWidth=2;size=0.19', width: 100, height: 65 },
      { label: t('Parallel Mode'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.parallel_mode;accentColor=#ffff00;pointerEvents=1', width: 95, height: 40 },
      { label: t('Predefined Process'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=process;whiteSpace=wrap;rounded=1;size=0.14;arcSize=6;', width: 100, height: 60 },
      { label: t('Preparation'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=hexagon;perimeter=hexagonPerimeter2;arcSize=6;size=0.27;', width: 100, height: 60 },
      { label: t('Process'), style: 'rounded=1;whiteSpace=wrap;html=1;absoluteArcSize=1;arcSize=14;strokeWidth=2;', width: 100, height: 100 },
      { label: t('Sequential Data'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.sequential_data;whiteSpace=wrap;', width: 100, height: 100 },
      { label: t('Sort'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.sort;', width: 100, height: 100 },
      { label: t('Start 1'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.start_1;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Start 2'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.start_2;whiteSpace=wrap;', width: 100, height: 100 },
      { label: t('Stored Data'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.stored_data;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Summing Junction'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.flowchart.summing_junction;', width: 70, height: 70 },
      { label: t('Terminator'), style: 'strokeWidth=2;html=1;shape=mxgraph.flowchart.terminator;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Transfer'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;strokeWidth=2;shape=mxgraph.arrows2.arrow;dy=0.6;dx=40;notch=0;', width: 100, height: 70 },
    ],
  },
  {
    id: 'arrows',
    name: t('Arrows & Connectors'),
    items: [
      { label: t('Straight'), style: 'endArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: t('Orthogonal'), style: 'edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;', width: 100, height: 100, edge: true },
      { label: t('Rounded Orthogonal'), style: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;', width: 100, height: 100, edge: true },
      { label: t('Curved'), style: 'edgeStyle=orthogonalEdgeStyle;curved=1;orthogonalLoop=1;jettySize=auto;html=1;', width: 100, height: 100, edge: true },
      { label: t('Horizontal Elbow'), style: 'edgeStyle=elbowEdgeStyle;elbow=horizontal;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;', width: 100, height: 100, edge: true },
      { label: t('Vertical Elbow'), style: 'edgeStyle=elbowEdgeStyle;elbow=vertical;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;', width: 100, height: 100, edge: true },
      { label: t('Entity Relation'), style: 'edgeStyle=entityRelationEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;', width: 100, height: 100, edge: true },
      { label: t('Manual Line'), style: 'edgeStyle=segmentEdgeStyle;endArrow=classic;html=1;curved=0;rounded=0;endSize=8;startSize=8;', width: 100, height: 100, edge: true },
      { label: t('Line'), style: 'endArrow=none;html=1;', width: 100, height: 100, edge: true },
      { label: t('Dashed Line'), style: 'endArrow=none;dashed=1;html=1;', width: 100, height: 100, edge: true },
      { label: t('Dotted Line'), style: 'endArrow=none;dashed=1;html=1;dashPattern=1 3;strokeWidth=2;', width: 100, height: 100, edge: true },
      { label: t('Dashed Arrow'), style: 'endArrow=classic;dashed=1;html=1;', width: 100, height: 100, edge: true },
      { label: t('Bidirectional'), style: 'endArrow=classic;startArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: t('Flex Arrow'), style: 'shape=flexArrow;endArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: t('Flex Bidirectional Arrow'), style: 'shape=flexArrow;endArrow=classic;startArrow=classic;html=1;', width: 100, height: 100, edge: true },
      { label: t('Link'), style: 'shape=link;html=1;', width: 100, height: 0, edge: true },
      ...lineTypes.map((type) => ({ label: t('Arrow: {type}', { type }), style: `endArrow=${type};endFill=1;html=1;`, width: 100, height: 0, edge: true })),
      ...lineTypes
        .filter((type) => !/^(open|dash|cross|halfCircle|baseDash)/.test(type))
        .map((type) => ({ label: t('Arrow: {type} (hollow)', { type }), style: `endArrow=${type};endFill=0;html=1;`, width: 100, height: 0, edge: true })),
    ],
  },
  {
    id: 'uml',
    name: t('UML'),
    items: [
      {
        label: t('Class'),
        style: 'swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
        width: 160,
        height: 86,
        value: 'Classname',
        children: [
          { value: '+ field: type', style: umlField, x: 0, y: 26, width: 160, height: 26 },
          { value: '', style: umlDivider, x: 0, y: 52, width: 160, height: 8 },
          { value: '+ method(type): type', style: umlField, x: 0, y: 60, width: 160, height: 26 },
        ],
      },
      {
        label: t('Class 2'),
        style: 'swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=26;fillColor=none;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;whiteSpace=wrap;html=1;',
        width: 140,
        height: 104,
        value: 'Classname',
        children: rows(umlField, ['+ field: type', '+ field: type', '+ field: type'], 140, 26, 26),
      },
      { label: t('Item'), style: umlField, width: 100, height: 26, value: '+ item: attribute' },
      { label: t('Divider'), style: umlDivider, width: 40, height: 8 },
      {
        label: t('Class (HTML)'),
        style: 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;',
        width: 160,
        height: 90,
        value: `<p style="margin:0px;margin-top:4px;text-align:center;"><b>Class</b></p>${hr}<p style="margin:0px;margin-left:4px;">+ field: Type</p>${hr}<p style="margin:0px;margin-left:4px;">+ method(): Type</p>`,
      },
      {
        label: t('Interface'),
        style: 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;',
        width: 190,
        height: 140,
        value: `<p style="margin:0px;margin-top:4px;text-align:center;"><i>&lt;&lt;Interface&gt;&gt;</i><br/><b>Interface</b></p>${hr}<p style="margin:0px;margin-left:4px;">+ field1: Type<br/>+ field2: Type</p>${hr}<p style="margin:0px;margin-left:4px;">+ method1(Type): Type<br/>+ method2(Type, Type): Type</p>`,
      },
      { label: t('Interface (simple)'), style: 'html=1;whiteSpace=wrap;', width: 110, height: 50, value: '&laquo;interface&raquo;<br><b>Name</b>' },
      { label: t('Object'), style: 'html=1;whiteSpace=wrap;', width: 110, height: 50, value: t('Object') },
      {
        label: t('Object Instance'),
        style: 'verticalAlign=top;align=left;overflow=fill;html=1;whiteSpace=wrap;',
        width: 160,
        height: 90,
        value: `<p style="margin:0px;margin-top:4px;text-align:center;text-decoration:underline;"><b>Object:Type</b></p>${hr}<p style="margin:0px;margin-left:8px;">field1 = value1<br/>field2 = value2<br>field3 = value3</p>`,
      },
      { label: t('Package'), style: 'shape=folder;fontStyle=1;spacingTop=10;tabWidth=40;tabHeight=14;tabPosition=left;html=1;whiteSpace=wrap;', width: 70, height: 50, value: 'package' },
      { label: t('Module'), style: 'shape=module;align=left;spacingLeft=20;align=center;verticalAlign=top;whiteSpace=wrap;html=1;', width: 100, height: 50, value: t('Module') },
      {
        label: t('Component'),
        style: 'html=1;dropTarget=0;whiteSpace=wrap;',
        width: 180,
        height: 90,
        value: '&laquo;Annotation&raquo;<br/><b>Component</b>',
        children: [{ style: 'shape=module;jettyWidth=8;jettyHeight=4;', x: 153, y: 7, width: 20, height: 20 }],
      },
      { label: t('Component (shape)'), style: 'shape=component;align=left;spacingLeft=36;rounded=0;dashed=0;html=1;whiteSpace=wrap;', width: 150, height: 60, value: t('Component') },
      { label: t('Block'), style: 'verticalAlign=top;align=left;spacingTop=8;spacingLeft=2;spacingRight=12;shape=cube;size=10;direction=south;fontStyle=4;html=1;whiteSpace=wrap;', width: 180, height: 120, value: t('Block') },
      { label: t('Note'), style: 'shape=note2;boundedLbl=1;whiteSpace=wrap;html=1;size=25;verticalAlign=top;align=center;', width: 120, height: 60, value: t('Note') },
      { label: t('Actor'), style: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;', width: 30, height: 60, value: t('Actor') },
      { label: t('Use Case'), style: 'ellipse;whiteSpace=wrap;html=1;', width: 140, height: 70, value: t('Use Case') },
      { label: t('Boundary Object'), style: 'shape=umlBoundary;whiteSpace=wrap;html=1;', width: 100, height: 80, value: t('Boundary Object') },
      { label: t('Entity Object'), style: 'ellipse;shape=umlEntity;whiteSpace=wrap;html=1;', width: 80, height: 80, value: t('Entity Object') },
      { label: t('Control Object'), style: 'ellipse;shape=umlControl;whiteSpace=wrap;html=1;', width: 70, height: 80, value: t('Control Object') },
      { label: t('Provided/Required Interface'), style: 'shape=providedRequiredInterface;html=1;verticalLabelPosition=bottom;sketch=0;', width: 20, height: 20 },
      { label: t('Required Interface'), style: 'shape=requiredInterface;html=1;verticalLabelPosition=bottom;sketch=0;', width: 10, height: 20 },
      { label: t('Provided Interface'), style: 'shape=lollipop;html=1;verticalLabelPosition=bottom;verticalAlign=top;', width: 10, height: 20 },
      { label: t('Start'), style: 'ellipse;html=1;shape=startState;fillColor=#000000;strokeColor=#ff0000;', width: 30, height: 30 },
      { label: t('Activity'), style: 'rounded=1;whiteSpace=wrap;html=1;arcSize=40;fontColor=#000000;fillColor=#ffffc0;strokeColor=#ff0000;', width: 120, height: 40, value: t('Activity') },
      { label: t('Condition'), style: 'rhombus;whiteSpace=wrap;html=1;fontColor=#000000;fillColor=#ffffc0;strokeColor=#ff0000;', width: 80, height: 40, value: t('Condition') },
      { label: t('Fork/Join'), style: 'shape=line;html=1;strokeWidth=6;strokeColor=#ff0000;', width: 200, height: 10 },
      { label: t('End'), style: 'ellipse;html=1;shape=endState;fillColor=#000000;strokeColor=#ff0000;', width: 30, height: 30 },
      { label: t('Lifeline'), style: lifeline, width: 100, height: 300, value: ':Object' },
      { label: t('Actor Lifeline'), style: lifeline + 'participant=umlActor;', width: 20, height: 300 },
      { label: t('Boundary Lifeline'), style: lifeline + 'participant=umlBoundary;', width: 50, height: 300 },
      { label: t('Entity Lifeline'), style: lifeline + 'participant=umlEntity;', width: 40, height: 300 },
      { label: t('Control Lifeline'), style: lifeline + 'participant=umlControl;', width: 40, height: 300 },
      { label: t('Activation Bar'), style: activation, width: 10, height: 80 },
      { label: t('Frame'), style: 'shape=umlFrame;whiteSpace=wrap;html=1;pointerEvents=0;', width: 300, height: 200, value: 'frame' },
      { label: t('Destruction'), style: 'shape=umlDestroy;whiteSpace=wrap;html=1;strokeWidth=3;targetShapes=umlLifeline;', width: 30, height: 30 },
      { label: t('Synchronous Message'), style: 'html=1;verticalAlign=bottom;endArrow=block;curved=0;rounded=0;', width: 80, height: 0, value: 'dispatch', edge: true },
      { label: t('Return Message'), style: 'html=1;verticalAlign=bottom;endArrow=open;dashed=1;endSize=8;curved=0;rounded=0;', width: 80, height: 0, value: 'return', edge: true },
      { label: t('Found Message'), style: 'html=1;verticalAlign=bottom;startArrow=oval;startFill=1;endArrow=block;startSize=8;curved=0;rounded=0;', width: 60, height: 0, edge: true },
      { label: t('Dependency'), style: 'endArrow=open;endSize=12;dashed=1;html=1;', width: 160, height: 0, value: 'Use', edge: true },
      { label: t('Generalization'), style: 'endArrow=block;endSize=16;endFill=0;html=1;', width: 160, height: 0, value: 'Extends', edge: true },
      { label: t('Implementation'), style: 'endArrow=block;dashed=1;endFill=0;endSize=12;html=1;', width: 160, height: 0, edge: true },
      { label: t('Association'), style: 'endArrow=open;endFill=1;endSize=12;html=1;', width: 160, height: 0, edge: true },
      { label: t('Bidirectional Association'), style: 'endArrow=block;startArrow=block;endFill=1;startFill=1;html=1;', width: 160, height: 0, edge: true },
      { label: t('Aggregation'), style: 'endArrow=diamondThin;endFill=0;endSize=24;html=1;', width: 160, height: 0, edge: true },
      { label: t('Composition'), style: 'endArrow=diamondThin;endFill=1;endSize=24;html=1;', width: 160, height: 0, edge: true },
      { label: t('Aggregation (with multiplicity)'), style: 'endArrow=open;html=1;endSize=12;startArrow=diamondThin;startSize=14;startFill=0;edgeStyle=orthogonalEdgeStyle;align=left;verticalAlign=bottom;', width: 160, height: 0, value: '1', edge: true },
      { label: t('Composition (with multiplicity)'), style: 'endArrow=open;html=1;endSize=12;startArrow=diamondThin;startSize=14;startFill=1;edgeStyle=orthogonalEdgeStyle;align=left;verticalAlign=bottom;', width: 160, height: 0, value: '1', edge: true },
      { label: t('Inner Class'), style: 'endArrow=open;startArrow=circlePlus;endFill=0;startFill=0;endSize=8;html=1;', width: 160, height: 0, edge: true },
      { label: t('Terminate'), style: 'endArrow=open;startArrow=cross;endFill=0;startFill=0;endSize=8;startSize=10;html=1;', width: 160, height: 0, edge: true },
    ],
  },
  {
    id: 'er',
    name: t('Entity Relation'),
    items: [
      {
        label: t('Table'),
        style: 'shape=table;startSize=30;container=1;collapsible=1;childLayout=tableLayout;fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;',
        width: 180,
        height: 150,
        value: t('Table'),
        children: [
          erTableRow('PK', 'UniqueID', 30, true, 'fontStyle=1;'),
          erTableRow('', 'Row 1', 60, false),
          erTableRow('', 'Row 2', 90, false),
          erTableRow('', 'Row 3', 120, false),
        ],
      },
      {
        label: t('Entity (Attributes)'),
        style: 'swimlane;childLayout=stackLayout;horizontal=1;startSize=50;horizontalStack=0;rounded=1;fontSize=14;fontStyle=0;strokeWidth=2;resizeParent=0;resizeLast=1;shadow=0;dashed=0;align=center;arcSize=4;whiteSpace=wrap;html=1;',
        width: 160,
        height: 120,
        value: t('Entity'),
        children: [
          {
            value: '+Attribute1<br>+Attribute2<br>+Attribute3',
            style: 'align=left;strokeColor=none;fillColor=none;spacingLeft=4;spacingRight=4;fontSize=12;verticalAlign=top;resizable=0;rotatable=0;part=1;html=1;whiteSpace=wrap;',
            x: 0,
            y: 50,
            width: 160,
            height: 70,
          },
        ],
      },
      {
        label: t('List'),
        style: 'swimlane;fontStyle=0;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;marginBottom=0;align=center;fontSize=14;',
        width: 160,
        height: 116,
        value: t('List'),
        children: rows(erRow, [1, 2, 3].map((n) => t('Item {n}', { n })), 160, 30, 26),
      },
      { label: t('List Item'), style: erRow, width: 40, height: 30, value: t('Item') },
      { label: t('Entity'), style: 'whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: t('Entity') },
      { label: t('Entity (Rounded)'), style: 'rounded=1;arcSize=10;whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: t('Entity') },
      { label: t('Weak Entity'), style: 'shape=ext;margin=3;double=1;whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: t('Entity') },
      { label: t('Attribute'), style: 'ellipse;whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: t('Attribute') },
      { label: t('Key Attribute'), style: 'ellipse;whiteSpace=wrap;html=1;align=center;fontStyle=4;', width: 100, height: 40, value: t('Attribute') },
      { label: t('Weak Key Attribute'), style: 'ellipse;whiteSpace=wrap;html=1;align=center;fontStyle=20;', width: 100, height: 40, value: t('Attribute') },
      { label: t('Derived Attribute'), style: 'ellipse;whiteSpace=wrap;html=1;align=center;dashed=1;', width: 100, height: 40, value: t('Attribute') },
      { label: t('Multivalue Attribute'), style: 'ellipse;shape=doubleEllipse;margin=3;whiteSpace=wrap;html=1;align=center;', width: 100, height: 40, value: t('Attribute') },
      { label: t('Associative Entity'), style: 'shape=associativeEntity;whiteSpace=wrap;html=1;align=center;', width: 140, height: 60, value: 'Associative<br>Entity' },
      { label: t('Relationship'), style: 'shape=rhombus;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;align=center;', width: 120, height: 60, value: t('Relationship') },
      { label: t('Identifying Relationship'), style: 'shape=rhombus;double=1;perimeter=rhombusPerimeter;whiteSpace=wrap;html=1;align=center;', width: 120, height: 60, value: t('Relationship') },
      { label: t('Cloud'), style: 'ellipse;shape=cloud;whiteSpace=wrap;html=1;align=center;', width: 100, height: 60, value: t('Cloud') },
      { label: t('Note'), style: 'shape=note;size=20;whiteSpace=wrap;html=1;', width: 100, height: 100, value: t('Note') },
      { label: t('0 to Many Optional'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToMany;endFill=1;', width: 100, height: 100, edge: true },
      { label: t('1 to Many'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;', width: 100, height: 100, edge: true },
      { label: t('1 Mandatory'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: t('1 to 1'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmandOne;startArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: '1', style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERone;endFill=1;', width: 100, height: 100, edge: true },
      { label: t('0 to 1'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToOne;endFill=1;', width: 100, height: 100, edge: true },
      { label: t('Many'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmany;', width: 100, height: 100, edge: true },
      { label: t('Many to Many'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERmany;startArrow=ERmany;', width: 100, height: 100, edge: true },
      { label: t('1 Optional to Many Optional'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToMany;startArrow=ERzeroToOne;', width: 100, height: 100, edge: true },
      { label: t('1 Mandatory to Many Optional'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToMany;startArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: t('1 Mandatory to 1 Optional'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToOne;startArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: t('1 Mandatory to Many Mandatory'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERmandOne;', width: 100, height: 100, edge: true },
      { label: t('1 Optional to Many Mandatory'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERzeroToOne;', width: 100, height: 100, edge: true },
      { label: t('Many Mandatory to Many Mandatory'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERoneToMany;', width: 100, height: 100, edge: true },
      { label: t('Many Optional to Many Mandatory'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERoneToMany;startArrow=ERzeroToMany;', width: 100, height: 100, edge: true },
      { label: t('Many Optional to Many Optional'), style: 'edgeStyle=entityRelationEdgeStyle;fontSize=12;html=1;endArrow=ERzeroToMany;endFill=1;startArrow=ERzeroToMany;', width: 100, height: 100, edge: true },
      { label: t('Relation'), style: 'endArrow=none;html=1;rounded=0;', width: 160, height: 0, edge: true },
      { label: t('Optional Participation'), style: 'endArrow=none;html=1;rounded=0;dashed=1;dashPattern=1 2;', width: 160, height: 0, edge: true },
      { label: t('Recursive Relationship'), style: 'shape=link;html=1;rounded=0;', width: 160, height: 0, edge: true },
    ],
  },
  {
    id: 'basic',
    name: t('Basic'),
    items: [
      { label: t('Partial Rectangle 1'), style: 'shape=partialRectangle;whiteSpace=wrap;html=1;top=0;bottom=0;fillColor=none;', width: 120, height: 60 },
      { label: t('Partial Rectangle 2'), style: 'shape=partialRectangle;whiteSpace=wrap;html=1;right=0;top=0;bottom=0;fillColor=none;routingCenterX=-0.5;', width: 120, height: 60 },
      { label: t('Partial Rectangle 3'), style: 'shape=partialRectangle;whiteSpace=wrap;html=1;bottom=0;right=0;fillColor=none;', width: 120, height: 60 },
      { label: t('Partial Rectangle 4'), style: 'shape=partialRectangle;whiteSpace=wrap;html=1;top=0;left=0;fillColor=none;', width: 120, height: 60 },
      { label: t('6 Point Star'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.6_point_star', width: 100, height: 90 },
      { label: t('8 Point Star'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.8_point_star', width: 100, height: 100 },
      { label: t('Banner'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.banner', width: 100, height: 50 },
      { label: t('Cloud Callout'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.cloud_callout', width: 90, height: 60 },
      { label: t('Cloud Rectangle'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.cloud_rect', width: 120, height: 90 },
      { label: t('Cone'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.cone', width: 100, height: 100 },
      { label: t('Document'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.document', width: 100, height: 100 },
      { label: t('Donut'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.donut;dx=25;', width: 100, height: 100 },
      { label: t('Drop'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.drop', width: 70, height: 100 },
      { label: t('Flash'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.flash', width: 60, height: 100 },
      { label: t('Half Circle'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.half_circle', width: 100, height: 50 },
      { label: t('Heart'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.heart', width: 100, height: 100 },
      { label: t('Loud Callout'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.loud_callout', width: 100, height: 60 },
      { label: t('Moon'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.moon', width: 75, height: 100 },
      { label: t('No Symbol'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.no_symbol', width: 100, height: 100 },
      { label: t('Octagon'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.octagon2;align=center;verticalAlign=middle;dx=15;', width: 100, height: 100 },
      { label: t('Orthogonal Triangle'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.orthogonal_triangle', width: 100, height: 70 },
      { label: t('Acute Triangle'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.acute_triangle;dx=0.5;', width: 100, height: 70 },
      { label: t('Obtuse Triangle'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.obtuse_triangle;dx=0.25;', width: 100, height: 70 },
      { label: t('Oval Callout'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.oval_callout', width: 100, height: 60 },
      { label: t('Pentagon'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.pentagon', width: 100, height: 90 },
      { label: t('Pointed Oval'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.pointed_oval', width: 50, height: 100 },
      { label: t('Diagonal Snip Rectangle'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.diag_snip_rect;dx=6;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Diagonal Rounded Rectangle'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.diag_round_rect;dx=6;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Corner Rounded Rectangle'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.corner_round_rect;dx=6;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Plaque'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.plaque;dx=6;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Frame'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.frame;dx=10;whiteSpace=wrap;', width: 100, height: 60 },
      { label: t('Rectangular Callout'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.rectCallout;dx=30;dy=15;boundedLbl=1;', width: 100, height: 60 },
      { label: t('Rounded Rectangular Callout'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.roundRectCallout;dx=30;dy=15;size=5;boundedLbl=1;', width: 100, height: 60 },
      { label: t('Layered Rectangle'), style: 'whiteSpace=wrap;html=1;shape=mxgraph.basic.layered_rect;dx=10;outlineConnect=0;boundedLbl=1;', width: 100, height: 60 },
      { label: t('Smiley'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.smiley', width: 100, height: 100 },
      { label: t('Star'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.star', width: 100, height: 95 },
      { label: t('Sun'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.sun', width: 100, height: 100 },
      { label: t('Tick'), style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.tick', width: 85, height: 100 },
      { label: 'X', style: 'verticalLabelPosition=bottom;verticalAlign=top;html=1;shape=mxgraph.basic.x', width: 100, height: 100 },
      { label: t('Message'), style: 'shape=message;html=1;html=1;outlineConnect=0;labelPosition=center;verticalLabelPosition=bottom;align=center;verticalAlign=top;', width: 60, height: 40 },
      { label: t('Cylinder Stack'), style: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;lid=0;', width: 60, height: 80 },
    ],
  },
]

/**
 * External dependencies
 */
import { clone } from 'lodash';

/**
 * WordPress dependencies
 */

import { useMergeRefs, useReducedMotion } from '@wordpress/compose';
import { __experimentalTreeGrid as TreeGrid } from '@wordpress/components';
import { useDispatch } from '@wordpress/data';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useReducer,
	useState,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import ListViewBranch from './branch';
import { ListViewContext } from './context';
import useListViewClientIds from './use-list-view-client-ids';
import { store as blockEditorStore } from '../../store';

const noop = () => {};
const expanded = ( state, action ) => {
	switch ( action.type ) {
		case 'expand':
			return { ...state, ...{ [ action.clientId ]: true } };
		case 'collapse':
			return { ...state, ...{ [ action.clientId ]: false } };
		default:
			return state;
	}
};

function findCurrentPosition( tree, id, parentId = '' ) {
	for ( let index = 0; index < tree.length; index++ ) {
		const block = tree[ index ];
		if ( block.clientId === id ) {
			return { parentId, index, block, tree };
		}
		if ( block.innerBlocks && block.innerBlocks.length > 0 ) {
			const match = findCurrentPosition(
				block.innerBlocks,
				id,
				block.clientId
			);
			if ( match ) {
				return match;
			}
		}
	}
	return false;
}

function removeItemFromTree( tree, id ) {
	const newTree = [];
	for ( let index = 0; index < tree.length; index++ ) {
		const block = tree[ index ];
		if ( block.clientId !== id ) {
			if ( block.innerBlocks.length > 0 ) {
				newTree.push( {
					...block,
					innerBlocks: removeItemFromTree( block.innerBlocks, id ),
				} );
			} else {
				newTree.push( { ...block } );
			}
		}
	}
	return newTree;
}

function addItemToTree( tree, id, item, insertAfter = true ) {
	const newTree = [];
	for ( let index = 0; index < tree.length; index++ ) {
		const block = tree[ index ];
		if ( block.clientId === id ) {
			if ( insertAfter ) {
				newTree.push( { ...block } );
				newTree.push( { ...item } );
			} else {
				newTree.push( { ...item } );
				newTree.push( { ...block } );
			}
		} else if ( block.clientId !== id ) {
			if ( block.innerBlocks.length > 0 ) {
				newTree.push( {
					...block,
					innerBlocks: addItemToTree(
						block.innerBlocks,
						id,
						item,
						insertAfter
					),
				} );
			} else {
				newTree.push( { ...block } );
			}
		}
	}
	return newTree;
}

// eslint-disable-next-line no-unused-vars
function findFirstValidPosition( positions, current, translate, moveDown ) {
	//TODO: this works, but after skipping an item translate can no longer be used to indicate drag direction.
	const ITEM_HEIGHT = 36;
	const iterate = moveDown ? 1 : -1;
	let index = current + iterate;
	let diff = Math.abs( translate );
	while ( positions[ index ] !== undefined && diff > ITEM_HEIGHT / 2 ) {
		const position = positions[ index ];
		if ( position.dropContainer || position.dropSibling ) {
			return position;
		}
		index += iterate;
		diff = diff - ITEM_HEIGHT;
	}
}

/**
 * Wrap `ListViewRows` with `TreeGrid`. ListViewRows is a
 * recursive component (it renders itself), so this ensures TreeGrid is only
 * present at the very top of the navigation grid.
 *
 * @param {Object}   props                                          Components props.
 * @param {Array}    props.blocks                                   Custom subset of block client IDs to be used
 *                                                                  instead of the default hierarchy.
 * @param {Function} props.onSelect                                 Block selection callback.
 * @param {boolean}  props.showNestedBlocks                         Flag to enable displaying nested blocks.
 * @param {boolean}  props.showOnlyCurrentHierarchy                 Flag to limit the list to the current hierarchy of
 *                                                                  blocks.
 * @param {boolean}  props.__experimentalFeatures                   Flag to enable experimental features.
 * @param {boolean}  props.__experimentalPersistentListViewFeatures Flag to enable features for the Persistent List
 *                                                                  View experiment.
 */
export default function ListView( {
	blocks,
	showOnlyCurrentHierarchy,
	onSelect = noop,
	__experimentalFeatures,
	__experimentalPersistentListViewFeatures,
	...props
} ) {
	const [ draggingId, setDraggingId ] = useState( false );
	const [ dropped, setDropped ] = useState( false );
	const { clientIdsTree, selectedClientIds } = useListViewClientIds(
		blocks,
		showOnlyCurrentHierarchy,
		__experimentalPersistentListViewFeatures,
		draggingId
	);
	const [ tree, setTree ] = useState( clientIdsTree );
	const { selectBlock, moveBlocksToPosition } = useDispatch(
		blockEditorStore
	);
	const selectEditorBlock = useCallback(
		( clientId ) => {
			selectBlock( clientId );
			onSelect( clientId );
		},
		[ selectBlock, onSelect ]
	);
	const [ expandedState, setExpandedState ] = useReducer( expanded, {} );

	const elementRef = useRef();
	const timeoutRef = useRef();
	const treeGridRef = useMergeRefs( [ elementRef, timeoutRef ] );

	const isMounted = useRef( false );
	useEffect( () => {
		isMounted.current = true;
	}, [] );

	const expand = ( clientId ) => {
		if ( ! clientId ) {
			return;
		}
		setExpandedState( { type: 'expand', clientId } );
	};
	const collapse = ( clientId ) => {
		if ( ! clientId ) {
			return;
		}
		setExpandedState( { type: 'collapse', clientId } );
	};
	const expandRow = ( row ) => {
		expand( row?.dataset?.block );
	};
	const collapseRow = ( row ) => {
		collapse( row?.dataset?.block );
	};

	const animate = ! useReducedMotion();

	const positionsRef = useRef( {} );
	const positions = positionsRef.current;
	const setPosition = ( clientId, offset ) =>
		( positions[ clientId ] = offset );

	const lastTarget = useRef( null );
	useEffect( () => {
		lastTarget.current = null;
	}, [] );

	const dropItem = () => {
		if ( ! lastTarget.current ) {
			return;
		}
		const { targetPosition, clientId, movingDown } = lastTarget.current;
		const targetId = targetPosition.clientId;
		const target = findCurrentPosition(
			removeItemFromTree( clientIdsTree, clientId ),
			targetId
		);
		const current = findCurrentPosition( clientIdsTree, clientId );

		const targetIndex = movingDown ? target.index + 1 : target.index;
		setDropped( true );
		moveBlocksToPosition(
			[ clientId ],
			current.parentId,
			target.parentId,
			targetIndex
		);
		lastTarget.current = null;
		// TODO:
		// - use cached representation while list view has focus (maybe after the first drag)
		// - cache removal of the dragged item in tree
		// - try storing parent positions on setPositions
		// - see what performance of a flat representation looks like
		timeoutRef.current = setTimeout( () => {
			setDropped( false );
		}, 200 );
	};

	const moveItem = ( block, listPosition, { translate } ) => {
		//TODO: support add to container
		//TODO: support add to child container
		//TODO: simplify state and code
		const { clientId } = block;
		const ITEM_HEIGHT = 36;

		if ( Math.abs( translate ) > ITEM_HEIGHT / 2 ) {
			const movingDown = translate > 0;
			const targetPosition = movingDown
				? positions[ listPosition + 1 ]
				: positions[ listPosition - 1 ];

			if ( targetPosition === undefined ) {
				return;
			}
			lastTarget.current = {
				clientId,
				targetPosition,
				movingDown,
			};
			const newTree = addItemToTree(
				removeItemFromTree( clientIdsTree, clientId ),
				targetPosition.clientId,
				block,
				movingDown
			);
			setTree( newTree );
		}
	};

	const contextValue = useMemo(
		() => ( {
			__experimentalFeatures,
			__experimentalPersistentListViewFeatures,
			isTreeGridMounted: isMounted.current,
			expandedState,
			expand,
			collapse,
			animate,
			draggingId,
			setDraggingId,
		} ),
		[
			__experimentalFeatures,
			__experimentalPersistentListViewFeatures,
			isMounted.current,
			expandedState,
			expand,
			collapse,
			animate,
			draggingId,
			setDraggingId,
		]
	);

	//TODO: mouseover on items highlights blocks and triggers a render check on all branches
	//TODO: used in prototyping, polish this more
	useEffect( () => {
		if ( draggingId ) {
			setTree( clone( clientIdsTree ) );
		}
	}, [ draggingId ] );

	useEffect( () => {
		if ( timeoutRef.current ) {
			clearTimeout( timeoutRef.current );
		}
	}, [] );

	return (
		<>
			<TreeGrid
				className="block-editor-list-view-tree"
				aria-label={ __( 'Block navigation structure' ) }
				ref={ treeGridRef }
				onCollapseRow={ collapseRow }
				onExpandRow={ expandRow }
				animate={ animate }
			>
				<ListViewContext.Provider value={ contextValue }>
					<ListViewBranch
						blocks={ draggingId || dropped ? tree : clientIdsTree }
						selectBlock={ selectEditorBlock }
						selectedBlockClientIds={ selectedClientIds }
						setPosition={ setPosition }
						moveItem={ moveItem }
						dropItem={ dropItem }
						{ ...props }
					/>
				</ListViewContext.Provider>
			</TreeGrid>
		</>
	);
}

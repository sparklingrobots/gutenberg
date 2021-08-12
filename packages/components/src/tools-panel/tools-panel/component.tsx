/**
 * Internal dependencies
 */
import ToolsPanelHeader from '../tools-panel-header';
import { ToolsPanelContext } from '../context';
import { useToolsPanel } from './hook';
import { View } from '../../view';
import { contextConnect } from '../../ui/context';
import type { ToolsPanelProps, toolsPanelforwardRef } from '../types';

const ToolsPanel = (
	props: ToolsPanelProps,
	forwardedRef: toolsPanelforwardRef
) => {
	const {
		children,
		header,
		label,
		panelContext,
		resetAllItems,
		toggleItem,
		...toolsPanelProps
	} = useToolsPanel( props );

	return (
		<View { ...toolsPanelProps } ref={ forwardedRef }>
			<ToolsPanelContext.Provider value={ panelContext }>
				<ToolsPanelHeader
					header={ header }
					menuLabel={ label }
					resetAll={ resetAllItems }
					toggleItem={ toggleItem }
				/>
				{ children }
			</ToolsPanelContext.Provider>
		</View>
	);
};

const ConnectedToolsPanel = contextConnect( ToolsPanel, 'ToolsPanel' );

export default ConnectedToolsPanel;
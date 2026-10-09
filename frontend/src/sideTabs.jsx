/**
 * 侧边工具面板的六个页签。
 *
 * 这份数据原先在 App.jsx（折叠态的竖排 rail）和 SidePanel.jsx（展开态的
 * 面板）里各写了一份，内容完全相同。国际化时改一处漏一处，合并到这里。
 *
 * 只合并**数据**，不合并渲染 —— 两处的点击行为不一样：rail 上点一下要
 * 顺手把面板展开（setPanelCollapsed(false)），面板里点则是走 onTabChange。
 *
 * 存的是 i18n key 而不是译文：t() 只能在渲染路径里调，存成常量的话
 * 切语言时不会更新。
 */
import React from 'react'
import { ApartmentOutlined, StarOutlined, SearchOutlined, BookOutlined } from '@ant-design/icons'

export const SIDE_TABS = [
  { key: 'translate', i18n: 'side.tab.translate', icon: '🌐' },
  { key: 'vocabulary', i18n: 'side.tab.vocabulary', icon: <BookOutlined /> },
  { key: 'notes', i18n: 'side.tab.notes', icon: '📝' },
  { key: 'bookmarks', i18n: 'side.tab.bookmarks', icon: <StarOutlined /> },
  { key: 'search', i18n: 'side.tab.search', icon: <SearchOutlined /> },
  { key: 'knowledge', i18n: 'side.tab.knowledge', icon: <ApartmentOutlined /> },
]

/** 判断某个 key 是不是侧栏页签（App 的菜单分发要用） */
export const SIDE_TAB_KEYS = SIDE_TABS.map(t => t.key)

# teaching-prj-mgmt

`teaching-prj-mgmt` 是独立、可版本化的通用作品管理前端组件与领域规则仓库。它不提供教学网站、鉴权、后端或跨平台共享作品组；宿主负责登录态、数据访问、编辑器路由和当前目录状态的保存。

当前四个私有包的版本均为 `0.1.0`，不会发布到公共 npm 注册表。

## 工作区与依赖方向

```text
@tigao/organizer-contracts
            ↑
@tigao/organizer-core
            ↑
@tigao/organizer-react

@tigao/organizer-contract-tests → contracts + core
```

- `organizer-contracts`：规范摘要、适配器和错误契约的运行时断言；不依赖 DOM、React 或网络。
- `organizer-core`：排序、目录筛选、树诊断、面包屑、移动目标、乐观定位和拖放 ID 的不可变纯函数。
- `organizer-react`：`ProjectOrganizer` 与 `useProjectOrganizer`；所有读写和打开行为都委托给宿主适配器。
- `organizer-contract-tests`：宿主可重复注册的适配器行为套件，以及仅用于测试/playground 的内存参考适配器。

`examples/playground` 只使用假数据做本地视觉和交互验证，不登录、不持久化，也不连接真实平台。

## 适配器接口

组件只调用以下八个方法，参数名和语义是稳定契约：

```js
loadDirectory({ ownerId = null, parentId = null })
loadAllGroups({ ownerId = null })
createProject({ name, parentId = null, templateId })
createGroup({ name, parentId = null })
renameItem({ kind, id, name })
repositionItem({ kind, id, parentId, beforeId })
deleteItem({ kind, id })
openProject(id)
```

`parentId` 只引用数字作品组 ID，`null` 表示根目录。项目 ID 是非空字符串，作品组 ID 是正整数。`repositionItem` 的 `parentId` 和 `beforeId` 必须显式提供；`beforeId = null` 表示追加到目标目录的同类序列末尾。作品和作品组分别排序，绝不共享 `beforeId` 序列。

写操作错误可以是任意 `Error` 子类。组件保留其 `message`、可选 `code` 和可选 `status`，失败时回滚乐观更新，再把原始对象传给 `onError`。

## 最小 React 接入

```jsx
import { useState } from 'react';
import { ProjectOrganizer } from '@tigao/organizer-react';
import '@tigao/organizer-react/styles.css';

export function ProjectsPage({ adapter, ownerId }) {
  const [parentId, setParentId] = useState(null);

  return (
    <ProjectOrganizer
      adapter={adapter}
      ownerId={ownerId}
      currentParentId={parentId}
      onCurrentParentIdChange={setParentId}
      onError={(error) => console.error(error)}
      renderProjectExtraActions={(project) => (
        <button type="button" onClick={() => showDetails(project.id)}>
          Details
        </button>
      )}
    />
  );
}
```

示例中的 `adapter` 是 URL 无关的宿主对象。组件不会读取 Cookie、localStorage 或其他登录状态，也不会直接发出网络请求。受控的 `parentId` 可由宿主同步到路由、页面状态或宿主选定的持久化位置。

`messages` 可覆盖所有用户可见术语，`icons` 可按 `project`、`group`、`drag`、`up`、`down`、`rename`、`move`、`delete` 提供 React 节点或渲染函数。`renderProjectExtraActions(project)` 可在项目卡片上增加宿主操作。

## 核心 API 与规则

`organizer-contracts` 导出 `ITEM_KINDS`、`ADAPTER_METHODS`、`OrganizerContractError`、摘要/目录/树/适配器/定位断言，以及 `getOrganizerErrorDetails`。

`organizer-core` 的能力映射如下：

- `compareSummaries`、`sortSummaries`、`normalizeSortOrders`：先按 `sortOrder`，平局保持输入顺序，并生成从 0 开始的连续编号。
- `listDirectory`：按 `parentId` 独立筛选和排序作品组与项目。
- `validateGroupTree`、`buildBreadcrumbs`：诊断重复 ID、缺失父组和循环，构建根到当前组路径。
- `getDescendantIds`、`listMoveTargets`、`formatGroupPath`：计算后代、排除非法组目标并显示完整路径。
- `calculateOffsetBeforeId`、`calculateDropBeforeId`：统一按钮和拖放的 `beforeId` 语义。
- `applyReposition`：不可变地应用同目录或跨目录乐观定位并归一化受影响目录。
- `createDragId`、`parseDragId`：生成和解析不会混淆字符串项目 ID 与数字组 ID 的拖放标识。

所有 core 函数都不读取时间、随机数、DOM、浏览器存储或网络，也不会原地修改输入。

## 组件行为、样式和无障碍

`ProjectOrganizer` 支持根目录/完整面包屑、组优先卡片、创建、重命名、删除、移动弹窗、上移/下移和同类拖放；项目可进入页面内作品组，项目或组可拖到合法作品组、祖先面包屑或根目录。拖放、方向按钮和移动弹窗最终都调用同一个 `repositionItem` 契约。

加载、空目录、适配器错误、只读、保存中和损坏树状态都有独立呈现。切换拥有者或目录时旧读取响应会被忽略；卸载后不再更新状态；同一项写入期间相关操作会禁用。结构诊断失败后写操作停止，但仍调用 `onError`。

CSS 仅使用 `.tigao-organizer` 命名空间，支持窄屏、触摸拖放、键盘焦点和 `prefers-reduced-motion`。可覆盖这些主要变量：

```css
.my-organizer-theme {
  --organizer-color-accent: #2563eb;
  --organizer-color-accent-soft: #dbeafe;
  --organizer-color-surface: #ffffff;
  --organizer-color-border: #d1d5db;
  --organizer-radius: 12px;
  --organizer-gap: 14px;
  --organizer-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
```

每个图标按钮都有 `aria-label` 和 `title`。拖放不是唯一操作路径，键盘或触摸用户可使用上移、下移和移动弹窗完成同等操作。

## 宿主复用契约测试

宿主在自己的测试环境中调用：

```js
import { runProjectOrganizerAdapterContract } from '@tigao/organizer-contract-tests';

runProjectOrganizerAdapterContract({
  test,
  assert,
  createHarness: () => createIsolatedHostHarness()
});
```

`createHarness` 每次必须返回隔离的 `{ adapter, controls?, getState? }`。`test` 和 `assert` 由宿主注入，因此套件不绑定具体测试运行器。宿主自己的 URL 和请求体映射测试仍留在宿主仓库。

## 本地开发与验证

```powershell
npm install
npm test
npm run check
npm run build
npm run pack:check
npm run playground
```

playground 含两层以上嵌套组、多个项目、可编辑/只读切换、下一次移动失败、损坏树和窄屏模式。刷新页面会重置所有假数据。

## 兼容与接入顺序

第一个版本先供已经实现同一八方法契约的 C++ 宿主接入；p5.js 和未来 Python 宿主可在各自节奏中实现适配器并复用契约测试。公共包按版本独立安装和回滚，不要求三个平台同步升级。本仓库不实现任何平台专属适配器，也不提供鉴权、后端、作品源码、运行、预览、历史版本、AI、课堂分发或跨平台共享作品组。

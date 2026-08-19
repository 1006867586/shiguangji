/**
 * 隐私政策（飨刻）
 *
 * 内容覆盖微信小程序审核要求项：
 * - 开发者信息 / 联系方式
 * - 数据收集清单（必填，与实际功能一致）
 * - 数据使用目的
 * - 第三方共享 / 委托处理
 * - 用户权利与申诉渠道
 * - 政策变更与生效日期
 *
 * 去社交化后，本服务仅提供以下功能：
 *   - 微信一键登录（个人主体可用）
 *   - 个人资料管理（昵称、头像）
 *   - 美食转盘随机选餐（默认菜系 / 分享池）
 *   - 店铺收藏与图片识别导入
 *
 * 不再提供任何 UGC 内容、评论、转发、圈子、消息通知功能。
 */

export const metadata = {
  title: "隐私政策 · 飨刻",
  description: "飨刻微信小程序的隐私政策说明",
};

const EFFECTIVE_DATE = "2026 年 8 月 19 日";
const APP_NAME = "飨刻";
const CONTACT_EMAIL = "1006867586@qq.com";

export default function PrivacyPage() {
  return (
    <main style={pageStyle}>
      <article style={articleStyle}>
        <h1 style={h1}>隐私政策</h1>
        <p style={meta}>生效日期：{EFFECTIVE_DATE}</p>

        <p>
          欢迎使用 <strong>{APP_NAME}</strong>（以下简称&ldquo;本服务&rdquo;）。我们非常重视您的隐私与个人信息保护，
          依据《中华人民共和国网络安全法》《中华人民共和国个人信息保护法》《微信小程序平台运营规范》等相关法律法规，
          制定本《隐私政策》并向您说明：在使用本服务时，我们如何收集、使用、存储、共享和保护您的个人信息，
          以及您所享有的权利和行使方式。
        </p>

        <h2 style={h2}>一、本服务提供的功能</h2>
        <p>本服务是一款面向小团体的聚餐工具类微信小程序，目前提供以下功能：</p>
        <ul>
          <li><strong>微信一键登录</strong>：用于识别用户身份、跨设备同步您的数据；</li>
          <li><strong>个人资料管理</strong>：您可主动填写昵称、选择头像；</li>
          <li><strong>美食转盘</strong>：基于本地默认菜系或您自定义的分享池进行随机选择；</li>
          <li><strong>店铺收藏</strong>：您可手动录入或通过截图识别的方式收藏店铺信息。</li>
        </ul>
        <p>
          本服务<strong>不提供</strong>任何用户内容发布、评论、点赞、转发、群组聊天、消息通知或朋友圈类功能，
          您也无需向其他用户公开任何个人信息。
        </p>

        <h2 style={h2}>二、我们收集的信息</h2>
        <ol>
          <li>
            <strong>微信授权信息</strong>：当您使用微信一键登录时，本服务会通过微信官方接口获取您的
            <code>openid</code>（及在您授权同一主体下的 <code>unionid</code>）用于识别用户身份。
            本服务<strong>不收集您的微信昵称、头像、性别、地区等公开信息</strong>，新用户默认昵称为
            <code>微信用户 + openid 后 4 位</code>。
          </li>
          <li>
            <strong>您主动填写的资料</strong>：您可在&ldquo;我的&rdquo;页面主动填写昵称、选择头像，这些内容仅用于
            在您的个人中心展示，不会被其他用户查看。
          </li>
          <li>
            <strong>店铺收藏数据</strong>：您手动录入或通过截图识别录入的店名、地址、电话、招牌菜、评分、人均、分类、简介等内容，
            仅保存在您自己的账户下，用于收藏列表的展示与管理。
          </li>
          <li>
            <strong>美食转盘分享池数据</strong>：您在使用转盘&ldquo;分享池&rdquo;功能时创建的店铺候选列表与分享码，
            用于生成可分享给好友的转盘候选清单。
          </li>
          <li>
            <strong>设备与日志信息</strong>：当您使用本服务时，微信小程序平台会自动收集您的设备型号、
            操作系统版本、微信版本号、网络类型、IP 地址等必要的运行日志信息，用于安全风控与故障排查。
          </li>
        </ol>
        <p>
          除上述信息外，本服务<strong>不收集</strong>您的通讯录、位置、相册（仅在您主动选择截图时调用一次，
          不会静默读取）、通讯记录或其他与上述功能无关的个人信息。
        </p>

        <h2 style={h2}>三、我们如何使用信息</h2>
        <ul>
          <li>为您提供美食转盘、店铺收藏、个人资料管理等核心功能；</li>
          <li>识别您的身份、维护账号安全与跨设备数据同步；</li>
          <li>故障排查、安全审计与风险防控；</li>
          <li>在您明确同意或法律允许的范围内用于其他用途。</li>
        </ul>
        <p>
          我们<strong>不会</strong>将您的个人信息用于本政策未载明的其他用途，亦不会出于商业目的出售您的个人信息。
        </p>

        <h2 style={h2}>四、第三方共享与委托处理</h2>
        <p>为了向您提供服务，我们会在下列范围内向第三方共享或委托处理您的部分信息：</p>
        <ul>
          <li>
            <strong>微信开放平台</strong>：用于身份识别（<code>openid</code>），由深圳市腾讯计算机系统有限公司提供；
          </li>
          <li>
            <strong>Supabase（数据托管）</strong>：用于存储您的账号资料、店铺收藏、转盘分享池数据，
            托管区域请以 Supabase 项目配置为准；
          </li>
          <li>
            <strong>Cloudflare R2（图片存储）</strong>：当您主动上传头像或收藏页截图时，用于对象存储与 CDN 分发。
            仅在您主动触发相应功能时启用。
          </li>
          <li>
            <strong>图片识别服务（可选）</strong>：当您主动使用&ldquo;截图识别导入收藏&rdquo;功能时，
            您选择的截图会被发送至图片识别服务提供商用于提取店铺信息，
            识别完成后即可删除原始截图，我们不会将其用于模型训练或对外共享。
          </li>
        </ul>
        <p>
          上述第三方均为实现本服务所必需，我们已与各服务方签订或依据其公开服务条款约定数据保护义务，
          要求其仅在授权范围内处理您的数据。
        </p>

        <h2 style={h2}>五、您的权利</h2>
        <ul>
          <li><strong>查阅 / 复制</strong>：您可在&ldquo;我的&rdquo;页面查看您的个人资料、收藏的店铺；</li>
          <li><strong>更正</strong>：您可在相应编辑页面修改昵称、头像、收藏的店铺信息；</li>
          <li><strong>删除</strong>：您可随时删除您的收藏数据；</li>
          <li><strong>注销账号</strong>：您可通过下方联系方式申请注销账号，注销后您的个人信息将被删除或匿名化处理，
            法律要求保留的记录除外；</li>
          <li><strong>撤回同意</strong>：您可随时退出登录或停止使用本服务；</li>
          <li><strong>投诉与申诉</strong>：如您认为本服务处理您的个人信息不符合本政策或法律要求，可通过下方联系方式投诉。
          </li>
        </ul>

        <h2 style={h2}>六、信息存储与安全</h2>
        <p>
          您的个人信息存储在中华人民共和国境内（Supabase 托管区域），我们采用业界通行的技术与管理措施保护您的信息安全，
          包括但不限于：TLS 加密传输、存储加密、访问权限控制、操作日志审计等。
          如发生信息安全事件，我们将在知悉后及时通知您。
        </p>

        <h2 style={h2}>七、未成年人保护</h2>
        <p>
          本服务面向一般用户。如您为未成年人，请在监护人陪同下阅读本政策并使用本服务。
          我们不会主动收集未成年人的个人信息；如发现未成年人使用本服务，请监护人及时与我们联系。
        </p>

        <h2 style={h2}>八、政策变更</h2>
        <p>
          本政策可能根据业务调整、法律法规变化等情况进行修订。修订后的政策将在本页面公布，
          如变更重大事项我们会通过显著方式提醒。修订生效后，您继续使用本服务即视为同意修订后的政策。
        </p>

        <h2 style={h2}>九、联系我们</h2>
        <p>
          如您对本政策或您的个人信息保护有任何疑问、意见或建议，请通过以下方式联系我们：
          <br />
          邮箱：<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          我们将在收到您的反馈后 <strong>15 个工作日内</strong> 予以回复。
        </p>

        <hr style={hr} />
        <p style={footer}>© {APP_NAME} · 让每一顿饭都值得记住</p>
      </article>
    </main>
  );
}

// ===== 内联样式（避免全局污染；项目用 Tailwind 但此页用纯 CSS 变量）=====
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f6f6f7",
  padding: "24px 16px 80px",
};
const articleStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  background: "#fff",
  borderRadius: 12,
  padding: "32px 24px",
  color: "#1f2937",
  fontSize: 15,
  lineHeight: 1.75,
  boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
};
const h1: React.CSSProperties = { fontSize: 28, fontWeight: 700, margin: "0 0 8px" };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 600, margin: "32px 0 12px", color: "#16a34a" };
const meta: React.CSSProperties = { color: "#9ca3af", fontSize: 13, margin: "0 0 24px" };
const hr: React.CSSProperties = { border: "none", borderTop: "1px solid #f1f5f9", margin: "32px 0 12px" };
const footer: React.CSSProperties = { textAlign: "center", color: "#9ca3af", fontSize: 13 };

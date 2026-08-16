/**
 * 隐私政策（飨刻）
 *
 * 内容覆盖微信小程序审核要求项：
 * - 开发者信息 / 联系方式
 * - 数据收集清单（必填）
 * - 数据使用目的
 * - 第三方共享 / 委托处理
 * - 用户权利与申诉渠道
 * - 政策变更与生效日期
 */

export const metadata = {
  title: "隐私政策 · 飨刻",
  description: "飨刻微信小程序的隐私政策说明",
};

const EFFECTIVE_DATE = "2026 年 8 月 15 日";
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

        <h2 style={h2}>一、我们收集的信息</h2>
        <ol>
          <li>
            <strong>微信授权信息</strong>：当您使用微信一键登录时，本服务会通过微信官方接口获取您的
            <code>openid</code>（及在您授权同一主体下的 <code>unionid</code>）用于识别用户身份。
            本服务<strong>不收集您的微信昵称、头像、性别、地区等公开信息</strong>，新用户默认昵称为
            <code>微信用户 + openid 后 4 位</code>。
          </li>
          <li>
            <strong>您主动发布的内容</strong>：您在饭局圈中发布的文字记录、评论、点赞、照片等由您主动提交的内容。
          </li>
          <li>
            <strong>饭局圈关系数据</strong>：您加入的圈子、圈子成员关系、活动参与记录等由本服务功能产生的关系数据。
          </li>
          <li>
            <strong>设备与日志信息</strong>：当您使用本服务时，微信小程序平台会自动收集您的设备型号、
            操作系统版本、微信版本号、网络类型、IP 地址等必要的运行日志信息，用于安全风控与故障排查。
          </li>
        </ol>

        <h2 style={h2}>二、我们如何使用信息</h2>
        <ul>
          <li>为您提供饭局圈记录、好友互动、内容浏览、收藏与统计等核心功能；</li>
          <li>识别您的身份、维护账号安全与权限控制；</li>
          <li>展示您发布的内容、评论、点赞给圈子内其他成员；</li>
          <li>故障排查、安全审计与风险防控；</li>
          <li>在您明确同意或法律允许的范围内用于其他用途。</li>
        </ul>
        <p>
          我们<strong>不会</strong>将您的个人信息用于本政策未载明的其他用途，亦不会出于商业目的出售您的个人信息。
        </p>

        <h2 style={h2}>三、第三方共享与委托处理</h2>
        <p>为了向您提供服务，我们会在下列范围内向第三方共享或委托处理您的部分信息：</p>
        <ul>
          <li>
            <strong>微信开放平台</strong>：用于身份识别（<code>openid</code>），由深圳市腾讯计算机系统有限公司提供；
          </li>
          <li>
            <strong>Supabase（数据托管）</strong>：用于用户数据、圈子数据、活动数据的存储与查询，
            托管区域请以 Supabase 项目配置为准；
          </li>
          <li>
            <strong>Cloudflare R2（图片存储，可选）</strong>：当您上传图片时，用于对象存储与 CDN 分发。
            仅在您主动发布含图片的活动时启用，未启用图片功能时不会向 R2 传输任何内容；
          </li>
          <li>
            <strong>AI（可选）</strong>：当您使用&ldquo;截图识别&rdquo;等 AI 功能时，截图内容会被发送给 AI 服务提供商用于解析，
            我们不会将其用于模型训练。
          </li>
        </ul>
        <p>
          上述第三方均为实现本服务所必需，我们已与各服务方签订或依据其公开服务条款约定数据保护义务，
          要求其仅在授权范围内处理您的数据。
        </p>

        <h2 style={h2}>四、您的权利</h2>
        <ul>
          <li><strong>查阅 / 复制</strong>：您可在&ldquo;我的&rdquo;页面查看您发布的内容、加入的圈子、收藏的地点；</li>
          <li><strong>更正</strong>：您可在相应编辑页面修改昵称、活动内容等信息；</li>
          <li><strong>删除</strong>：您可删除您发布的内容、退出圈子、删除收藏；</li>
          <li><strong>注销账号</strong>：您可通过下方联系方式申请注销账号，注销后您的个人信息将被删除或匿名化处理，
            法律要求保留的记录除外；</li>
          <li><strong>撤回同意</strong>：您可随时退出登录或停止使用本服务；</li>
          <li><strong>投诉与申诉</strong>：如您认为本服务处理您的个人信息不符合本政策或法律要求，可通过下方联系方式投诉。
          </li>
        </ul>

        <h2 style={h2}>五、信息存储与安全</h2>
        <p>
          您的个人信息存储在中华人民共和国境内（Supabase 托管区域），我们采用业界通行的技术与管理措施保护您的信息安全，
          包括但不限于：TLS 加密传输、存储加密、访问权限控制、操作日志审计等。
          如发生信息安全事件，我们将在知悉后及时通知您。
        </p>

        <h2 style={h2}>六、未成年人保护</h2>
        <p>
          本服务面向一般用户。如您为未成年人，请在监护人陪同下阅读本政策并使用本服务。
          我们不会主动收集未成年人的个人信息；如发现未成年人使用本服务，请监护人及时与我们联系。
        </p>

        <h2 style={h2}>七、政策变更</h2>
        <p>
          本政策可能根据业务调整、法律法规变化等情况进行修订。修订后的政策将在本页面公布，
          如变更重大事项我们会通过显著方式提醒。修订生效后，您继续使用本服务即视为同意修订后的政策。
        </p>

        <h2 style={h2}>八、联系我们</h2>
        <p>
          如您对本政策或您的个人信息保护有任何疑问、意见或建议，请通过以下方式联系我们：
          <br />
          邮箱：<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          我们将在收到您的反馈后 <strong>15 个作工作日内</strong> 予以回复。
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

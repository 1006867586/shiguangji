/**
 * 用户协议（飨刻）
 *
 * 内容覆盖微信小程序审核要求项：
 * - 服务说明
 * - 用户行为规范
 * - 账号管理与所有权
 * - 知识产权
 * - 免责声明与责任限制
 * - 协议变更与终止
 * - 法律适用与争议解决
 */

export const metadata = {
  title: "用户协议 · 飨刻",
  description: "飨刻微信小程序的用户服务协议",
};

const EFFECTIVE_DATE = "2026 年 8 月 15 日";
const APP_NAME = "飨刻";
const CONTACT_EMAIL = "1006867586@qq.com";

export default function AgreementPage() {
  return (
    <main style={pageStyle}>
      <article style={articleStyle}>
        <h1 style={h1}>用户服务协议</h1>
        <p style={meta}>生效日期：{EFFECTIVE_DATE}</p>

        <p>
          欢迎使用 <strong>{APP_NAME}</strong>（以下简称&ldquo;本服务&rdquo;）。在使用本服务之前，
          请您仔细阅读本《用户服务协议》（以下简称&ldquo;本协议&rdquo;）。一旦您开始使用本服务，即视为您已充分理解、
          同意并接受本协议全部条款。
        </p>

        <h2 style={h2}>一、服务说明</h2>
        <p>
          {APP_NAME} 是一款面向 3–20 人小团体的私密聚餐记录应用，提供朋友圈式动态发布、好友互动、收藏管理、美食轮盘等功能。
          本服务由个人开发者运营，旨在为用户提供一个记录饭局、分享体验、增进友谊的工具。
        </p>

        <h2 style={h2}>二、账号注册与使用</h2>
        <ol>
          <li>本服务通过微信一键登录获取您的 <code>openid</code> 用于身份识别；</li>
          <li>每个微信账号对应一个本服务账号，不可重复注册；</li>
          <li>您应妥善保管微信账号，因微信账号被盗用导致的损失由您自行承担；</li>
          <li>如发现账号被盗用或他人冒用，请立即通过下方联系方式通知我们。
          </li>
        </ol>

        <h2 style={h2}>三、用户行为规范</h2>
        <p>您在使用本服务时，须遵守法律法规及本协议，不得从事以下行为：</p>
        <ul>
          <li>发布、传播违反国家法律法规、危害国家安全、宣扬恐怖主义、民族仇恨、色情、暴力等内容；</li>
          <li>发布虚假信息、恶意骚扰他人、侵犯他人合法权益；</li>
          <li>未经授权发布他人隐私信息（如姓名、电话、地址、照片等）；</li>
          <li>利用本服务从事任何商业营销、赌博、传销等违法违规活动；</li>
          <li>利用技术手段攻击、破解、干扰本服务正常运行；</li>
          <li>其他违反法律法规或公序良俗的行为。
          </li>
        </ul>
        <p>
          如您违反上述规范，我们有权采取包括但不限于内容删除、警告、限制功能、封禁账号等措施，
          并保留追究法律责任的权利。
        </p>

        <h2 style={h2}>四、用户内容与知识产权</h2>
        <ol>
          <li>
            您在本服务发布的文字、图片、评论等内容（以下统称&ldquo;用户内容&rdquo;）的知识产权归您或原始权利人所有；
          </li>
          <li>
            您授予本服务一项<strong>非独占、可撤销、免费</strong>的使用许可，用于在本服务内展示、存储、传输您的用户内容；
          </li>
          <li>
            您的用户内容应合法合规，如因您的内容导致第三方投诉或法律责任，由您自行承担；
          </li>
          <li>
            本服务的代码、设计、商标、UI 等知识产权归运营者所有，未经书面许可不得复制、修改或商业使用。
          </li>
        </ol>

        <h2 style={h2}>五、免责声明</h2>
        <ul>
          <li>
            本服务按&ldquo;现状&rdquo;提供，运营者不对服务的及时性、安全性、稳定性、准确性作出任何明示或暗示的承诺；
          </li>
          <li>
            因不可抗力（包括但不限于自然灾害、网络故障、政策变化、第三方服务中断等）导致的服务中断或数据丢失，
            运营者不承担责任；
          </li>
          <li>
            用户之间因饭局圈互动产生的纠纷，由相关用户自行协商解决，运营者不承担连带责任；
          </li>
          <li>
            本服务涉及的第三方服务（Supabase 数据托管、Cloudflare R2 图片存储、AI 服务等）由其各自运营方负责。
          </li>
        </ul>

        <h2 style={h2}>六、服务变更与终止</h2>
        <ol>
          <li>
            运营者有权根据业务发展、法律法规要求等情况对本服务进行变更、升级、暂停或终止；
          </li>
          <li>
            如本服务发生重大变更或终止，我们会通过合理方式（如应用内通知、官方公告）提前告知；
          </li>
          <li>
            您可随时停止使用本服务或申请注销账号；账号注销后，您的个人信息将按《隐私政策》处理。
          </li>
        </ol>

        <h2 style={h2}>七、协议变更</h2>
        <p>
          运营者有权根据法律法规变化、业务调整等情况修订本协议。修订后的协议将在本页面公布，
          修订生效后，您继续使用本服务即视为同意修订后的协议。如您不同意修订内容，应停止使用本服务。
        </p>

        <h2 style={h2}>八、法律适用与争议解决</h2>
        <p>
          本协议的订立、执行和解释均适用中华人民共和国法律。如发生争议，双方应友好协商解决；
          协商不成的，提交运营者所在地有管辖权的人民法院诉讼解决。
        </p>

        <h2 style={h2}>九、联系我们</h2>
        <p>
          如您对本协议有任何疑问、意见或建议，请通过以下方式联系我们：
          <br />
          邮箱：<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>

        <hr style={hr} />
        <p style={footer}>© {APP_NAME} · 让每一顿饭都值得记住</p>
      </article>
    </main>
  );
}

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

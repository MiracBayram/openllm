use minijinja::{Environment, context};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub fn apply_chat_template(template_str: &str, messages: &[ChatMessage]) -> Result<String, String> {
    let mut env = Environment::new();
    env.add_template("chat", template_str).map_err(|e| e.to_string())?;
    
    let tmpl = env.get_template("chat").map_err(|e| e.to_string())?;
    
    let ctx = context! {
        messages => messages,
        add_generation_prompt => true,
    };

    tmpl.render(ctx).map_err(|e| e.to_string())
}
